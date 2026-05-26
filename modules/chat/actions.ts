'use server';

import { prisma } from '@/lib/infrastructure/prisma';
import { auth } from '@/lib/services/auth';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/infrastructure/logger';
import type { Conversation } from '@/lib/types/index';
import { buildThreadSlug } from '@/lib/utils/slug';
import { emitThreadMessage } from '@/modules/ws/publisher';
import { z } from 'zod';
import { attachmentInputSchema } from '@/lib/schemas/database';
import { withValidation } from '@/lib/utils/server-action';
import { prismaErrorMessage } from '@/lib/utils/errors';
import { requireSectionMembership } from '@/modules/auth/session';

const createConversationSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['channel', 'dm']),
  memberIds: z.array(z.string().cuid()).optional(),
});

const conversationIdSchema = z.object({
  conversationId: z.string().cuid(),
});

const messagesQuerySchema = z.object({
  conversationId: z.string().cuid(),
  limit: z.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

const sendMessageSchema = z
  .object({
    content: z.string().optional(),
    conversationId: z.string().cuid(),
    attachments: z.array(attachmentInputSchema).optional(),
  })
  .refine((data) => !!data.content || (data.attachments?.length ?? 0) > 0, {
    message: 'Missing content or attachments',
  });

export async function getConversations(): Promise<{ data: Conversation[] | null; error: string | null; ok: boolean; errorCode: string | null }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return { data: [], error: 'Authentication required', ok: false, errorCode: 'AUTH_REQUIRED' };
    }

    const sections = await prisma.section.findMany({
      where: {
        members: { some: { userId: session.user.id } },
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const conversations = sections.map((section) => ({
      id: section.id,
      name: section.name,
      avatar: '',
      lastMessage: section.messages[0]?.content || 'No messages yet',
      timestamp: section.messages[0]?.createdAt.toISOString() || section.updatedAt.toISOString(),
      unread: 0,
      online: true,
      type: 'channel' as const,
    }));

    return { data: conversations, error: null, ok: true, errorCode: null };
  } catch (error) {
    logger.error('[GET_CONVERSATIONS]', error);
    const prismaMsg = prismaErrorMessage(error);
    if (prismaMsg) return { data: [], error: prismaMsg, ok: false, errorCode: 'INTERNAL_ERROR' };
    return { data: [], error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
  }
}

export const createConversation = withValidation(
  createConversationSchema,
  'createConversation',
  async ({ name, description, type, memberIds }) => {
    try {
      const session = await auth.api.getSession({
        headers: await headers(),
      });

      if (!session) {
        return { data: null, error: 'Authentication required', ok: false, errorCode: 'AUTH_REQUIRED' };
      }

      if (type === 'channel') {
        const section = await prisma.section.create({
          data: {
            name,
            description,
            createdBy: session.user.id,
            slug: buildThreadSlug(name),
          },
        });

        revalidatePath('/chat');
        return {
          data: {
            id: section.id,
            name: section.name,
            avatar: '',
            lastMessage: 'No messages yet',
            timestamp: section.updatedAt.toISOString(),
            unread: 0,
            online: true,
            type: 'channel',
          },
          error: null,
          ok: true,
          errorCode: null,
        };
      }

      return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
    } catch (error) {
      logger.error('[CREATE_CONVERSATION]', error);
      const prismaMsg = prismaErrorMessage(error);
      if (prismaMsg) return { data: null, error: prismaMsg, ok: false, errorCode: 'INTERNAL_ERROR' };
      return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);

export const getMessages = withValidation(
  messagesQuerySchema,
  'getMessages',
  async ({ conversationId, limit, cursor }) => {
    try {
      const session = await auth.api.getSession({
        headers: await headers(),
      });

      if (!session) {
        return { data: { messages: [], nextCursor: null, hasMore: false }, error: 'Authentication required', ok: false, errorCode: 'AUTH_REQUIRED' };
      }

      try {
        await requireSectionMembership(conversationId, session.user.id);
      } catch {
        return { data: { messages: [], nextCursor: null, hasMore: false }, error: 'Access denied', errorCode: 'FORBIDDEN', ok: false };
      }

      const messages = await prisma.message.findMany({
        where: {
          sectionId: conversationId,
          ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
        },
        include: {
          sender: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
      });

      messages.reverse();

      const nextCursor = messages.length === limit ? messages[0]?.createdAt.toISOString() : null;
      const hasMore = messages.length === limit;

      const formattedMessages = messages.map((msg) => ({
        id: msg.id,
        sender: msg.sender.name || msg.sender.email,
        content: msg.content,
        timestamp: msg.createdAt.toISOString(),
        avatar: msg.sender.image,
        isOwn: msg.senderId === session.user.id,
        status: 'read' as const,
      }));

      return {
        data: { messages: formattedMessages, nextCursor, hasMore },
        error: null,
        ok: true,
        errorCode: null,
      };
    } catch (error) {
      logger.error('[GET_MESSAGES]', error);
      const prismaMsg = prismaErrorMessage(error);
      if (prismaMsg) return { data: { messages: [], nextCursor: null, hasMore: false }, error: prismaMsg, ok: false, errorCode: 'INTERNAL_ERROR' };
      return { data: { messages: [], nextCursor: null, hasMore: false }, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);

export const sendMessage = withValidation(
  sendMessageSchema,
  'sendMessage',
  async ({ content, conversationId, attachments }) => {
    try {
      const session = await auth.api.getSession({
        headers: await headers(),
      });

      if (!session) {
        return { data: null, error: 'Authentication required', ok: false, errorCode: 'AUTH_REQUIRED' };
      }

      try {
        await requireSectionMembership(conversationId, session.user.id);
      } catch {
        return { data: null, error: 'Access denied', errorCode: 'FORBIDDEN', ok: false };
      }

      const message = await prisma.message.create({
        data: {
          content: content || '',
          sectionId: conversationId,
          senderId: session.user.id,
          attachments: {
            create:
              attachments?.map((att) => ({
                url: att.url,
                type: att.type as 'FILE' | 'IMAGE' | 'GIF',
                name: att.name,
                size: att.size ? Number(att.size) : null,
              })) || [],
          },
        },
        include: {
          sender: {
            select: { id: true, name: true, email: true, image: true },
          },
          attachments: true,
        },
      });

      emitThreadMessage(conversationId, {
        id: message.id,
        content: message.content,
        senderId: message.senderId,
        senderName: message.sender.name || session.user.email,
        senderAvatar: message.sender.image,
        createdAt: message.createdAt,
        sectionId: conversationId,
        parentId: null,
        depth: 0,
        likeCount: 0,
        replyCount: 0,
        isAiResponse: false,
        reactions: [],
        attachments: message.attachments.map((att) => ({
          id: att.id,
          url: att.url,
          type: att.type,
          name: att.name,
          size: att.size !== null ? Number(att.size) : null,
        })),
      });

      revalidatePath('/chat');
      return {
        data: {
          id: message.id,
          sender: message.sender.name || message.sender.email,
          content: message.content,
          timestamp: message.createdAt.toISOString(),
          avatar: message.sender.image,
          isOwn: true,
          status: 'sent' as const,
          attachments: message.attachments.map((att) => ({
            id: att.id,
            name: att.name ?? null,
            url: att.url,
            type: att.type,
            size: att.size ? Number(att.size) : null,
          })),
        },
        error: null,
        ok: true,
        errorCode: null,
      };
    } catch (error) {
      logger.error('[SEND_MESSAGE]', error);
      const prismaMsg = prismaErrorMessage(error);
      if (prismaMsg) return { data: null, error: prismaMsg, ok: false, errorCode: 'INTERNAL_ERROR' };
      return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);

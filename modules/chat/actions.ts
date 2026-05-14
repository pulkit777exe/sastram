'use server';

import { prisma } from '@/lib/infrastructure/prisma';
import { auth } from '@/lib/services/auth';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/infrastructure/logger';
import type { ActionResponse, Conversation, ChatMessage, AttachmentInput } from '@/lib/types/index';
import { buildThreadSlug } from '@/lib/utils/slug';
import { emitThreadMessage } from '@/modules/ws/publisher';
import { z } from 'zod';
import { attachmentInputSchema } from '@/lib/schemas/database';
import { withValidation } from '@/lib/utils/server-action';

const createConversationSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['channel', 'dm']),
  memberIds: z.array(z.string().cuid()).optional(),
});

const conversationIdSchema = z.object({
  conversationId: z.string().cuid(),
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

export async function getConversations(): Promise<ActionResponse<Conversation[]>> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return { data: [], error: 'Something went wrong' };
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

    return { data: conversations, error: null };
  } catch (error) {
    logger.error('[GET_CONVERSATIONS]', error);
    return { data: [], error: 'Something went wrong' };
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
        return { data: null, error: 'Something went wrong' };
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
        };
      }

      return { data: null, error: 'Something went wrong' };
    } catch (error) {
      logger.error('[CREATE_CONVERSATION]', error);
      return { data: null, error: 'Something went wrong' };
    }
  }
);

export const getMessages = withValidation(
  conversationIdSchema,
  'getMessages',
  async ({ conversationId }) => {
    try {
      const session = await auth.api.getSession({
        headers: await headers(),
      });

      if (!session) {
        return { data: [], error: 'Something went wrong' };
      }

      const member = await prisma.sectionMember.findUnique({
        where: {
          sectionId_userId: { sectionId: conversationId, userId: session.user.id },
        },
      });

      if (!member) {
        return { data: [], error: 'Access denied', errorCode: 'FORBIDDEN', ok: false };
      }

      const messages = await prisma.message.findMany({
        where: {
          sectionId: conversationId,
        },
        include: {
          sender: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      const formattedMessages = messages.map((msg) => ({
        id: msg.id,
        sender: msg.sender.name || msg.sender.email,
        content: msg.content,
        timestamp: msg.createdAt.toISOString(),
        avatar: msg.sender.image,
        isOwn: msg.senderId === session.user.id,
        status: 'read' as const,
      }));

      return { data: formattedMessages, error: null };
    } catch (error) {
      logger.error('[GET_MESSAGES]', error);
      return { data: [], error: 'Something went wrong' };
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
        return { data: null, error: 'Something went wrong' };
      }

      const member = await prisma.sectionMember.findUnique({
        where: {
          sectionId_userId: { sectionId: conversationId, userId: session.user.id },
        },
      });

      if (!member) {
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
          sender: true,
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

      revalidatePath('/chat'); // Revalidate to show new message
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
      };
    } catch (error) {
      logger.error('[SEND_MESSAGE]', error);
      return { data: null, error: 'Something went wrong' };
    }
  }
);

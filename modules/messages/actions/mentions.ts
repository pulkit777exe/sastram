'use server';

import { requireSession } from '@/modules/auth';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { createServerAction } from '@/lib/utils/server-action';
import { searchMentionUsersSchema } from '@/modules/messages/schemas';
import type { MessageSideEffectsPort } from '@/modules/messages/ports/side-effects';
import { ROUTES } from '@/lib/config/routes';
import { createBulkNotifications } from '@/modules/notifications/repository';

export async function createMentionsForMessage(args: {
  messageId: string;
  threadId: string;
  mentions: string[];
  mentionedBy: {
    id: string;
    name: string | null;
    email: string;
  };
  content: string;
  parentId: string | null;
  threadSlug: string | null;
  sideEffects: MessageSideEffectsPort;
}) {
  if (args.mentions.length === 0) {
    return;
  }

  await prisma.messageMention.createMany({
    data: args.mentions.map((userId) => ({
      messageId: args.messageId,
      userId,
    })),
  });

  const linkUrl = args.threadSlug
    ? `${ROUTES.THREAD(args.threadSlug)}?focus=${args.messageId}`
    : null;

  await createBulkNotifications(
    args.mentions.map((userId) => ({
      userId,
      type: 'MENTION' as const,
      title: 'You were mentioned',
      message: `${args.mentionedBy.name || args.mentionedBy.email} mentioned you in a message`,
      data: { messageId: args.messageId, threadId: args.threadId, linkUrl },
    }))
  );

  for (const userId of args.mentions) {
    args.sideEffects.emitMentionNotification(args.threadId, {
      messageId: args.messageId,
      mentionedUserId: userId,
      mentionedBy: args.mentionedBy.id,
      mentionedByName: args.mentionedBy.name || args.mentionedBy.email,
      threadId: args.threadId,
      content: args.content,
      parentId: args.parentId ?? undefined,
    });
  }

  const thread = await prisma.thread.findUnique({
    where: { id: args.threadId },
    select: { name: true, slug: true },
  });

  if (!thread) {
    return;
  }

  const threadUrl = `${process.env.NEXT_PUBLIC_APP_URL}${ROUTES.THREAD(thread.slug)}`;

  const mentionedUsers = await prisma.user.findMany({
    where: { id: { in: args.mentions } },
    select: { email: true },
  });

  for (const mentionedUser of mentionedUsers) {
    args.sideEffects
      .sendMentionEmail({
        toEmail: mentionedUser.email,
        mentionedByName: args.mentionedBy.name || args.mentionedBy.email,
        threadName: thread.name,
        contentPreview: args.content.substring(0, 200),
        threadUrl,
      })
      .catch((error) => {
        logger.error('[createMentionsForMessage] failed mention email', error);
      });
  }
}

export const searchMentionUsers = createServerAction(
  { schema: searchMentionUsersSchema, actionName: 'searchMentionUsers' },
  async ({ threadId, query }) => {
    const session = await requireSession(false);

    try {
      const membership = await prisma.threadMember.findUnique({
        where: { threadId_userId: { threadId, userId: session.user.id } },
      });

      if (!membership) {
        return {
          data: null,
          error: 'Forbidden',
          errorCode: 'FORBIDDEN',
          ok: false,
        };
      }

      const users = await prisma.user.findMany({
        where: {
          id: { not: session.user.id },
          memberships: {
            some: { threadId },
          },
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
        orderBy: { reputationPoints: 'desc' },
        take: 5,
      });

      return {
        data: users.map((user) => {
          const base = (user.name || user.email.split('@')[0] || 'user')
            .toLowerCase()
            .replace(/[^a-z0-9.-]/g, '');

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            handle: base || 'user',
          };
        }),
        error: null,
        errorCode: null,
        ok: true,
      };
    } catch (error) {
      logger.error('[searchMentionUsers]', error);
      return {
        data: null,
        error: 'Something went wrong',
        errorCode: 'INTERNAL_ERROR',
        ok: false,
      };
    }
  }
);

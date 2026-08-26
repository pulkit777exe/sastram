'use server';

import { requireSession } from '@/modules/auth';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { createServerAction } from '@/lib/utils/server-action';
import { searchMentionUsersSchema } from '@/modules/messages/schemas';
import { requireThreadAccessOrThrow } from '@/lib/thread-access';
import type { MessageSideEffectsPort } from '@/modules/messages/ports/side-effects';
import { ROUTES } from '@/lib/config/routes';
import { actionSuccess } from '@/lib/actions/result';

const EMAIL_PREVIEW_LENGTH = 200;

export async function createMentionsForMessage({
  messageId,
  threadId,
  mentions,
  mentionedBy,
  content,
  threadSlug,
  sideEffects,
}: {
  messageId: string;
  threadId: string;
  mentions: string[];
  mentionedBy: {
    id: string;
    name: string | null;
    email: string;
  };
  content: string;
  threadSlug: string | null;
  sideEffects: MessageSideEffectsPort;
}) {
  if (mentions.length === 0) return;

  const mentionerName = mentionedBy.name || mentionedBy.email;

  await prisma.messageMention.createMany({
    data: mentions.map((userId) => ({ messageId, userId })),
  });

  await sideEffects.createBulkNotifications(
    mentions.map((userId) => ({
      userId,
      type: 'MENTION' as const,
      title: 'You were mentioned',
      message: `${mentionerName} mentioned you in a message`,
      data: {
        messageId,
        threadId,
        linkUrl: threadSlug ? `${ROUTES.THREAD(threadSlug)}?focus=${messageId}` : null,
      },
    }))
  );

  const thread = await prisma.thread.findFirst({
    where: { id: threadId, deletedAt: null },
    select: { name: true, slug: true },
  });

  if (!thread) return;

  const threadUrl = `${process.env.NEXT_PUBLIC_APP_URL}${ROUTES.THREAD(thread.slug)}`;
  const mentionedUsers = await prisma.user.findMany({
    where: { id: { in: mentions }, deletedAt: null },
    select: { email: true },
  });

  // Fire-and-forget: a bounced mention email must not fail the post.
  for (const { email } of mentionedUsers) {
    sideEffects
      .sendMentionEmail({
        toEmail: email,
        mentionedByName: mentionerName,
        threadName: thread.name,
        contentPreview: content.substring(0, EMAIL_PREVIEW_LENGTH),
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
      await requireThreadAccessOrThrow(threadId, session.user.id, session.user.role);

      const users = await prisma.user.findMany({
        where: {
          id: { not: session.user.id },
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
        orderBy: { followerCount: 'desc' },
        take: 5,
      });

      return actionSuccess(users.map((user) => ({
        ...user,
        handle:
          (user.name || user.email.split('@')[0] || '')
            .toLowerCase()
            .replace(/[^a-z0-9.-]/g, '') || 'user',
      })));
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

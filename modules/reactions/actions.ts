'use server';

import { z } from 'zod';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth';
import {
  addReaction,
  removeReaction,
  getMessageReactions,
  getUserReaction,
} from '@/modules/reactions/repository';
import { createServerAction } from '@/lib/utils/server-action';
import { requireThreadAccessOrThrow } from '@/lib/thread-access';
import { actionSuccess, actionFailure } from '@/lib/actions/result';

const toggleReactionSchema = z.object({
  messageId: z.string().cuid(),
  emoji: z.string().min(1),
});

const getReactionSummarySchema = z.object({
  messageId: z.string().cuid(),
});

type AuthorizedMessage = {
  session: Awaited<ReturnType<typeof requireSession>>;
  threadId: string;
};

async function requireMessageAccess(messageId: string): Promise<AuthorizedMessage | null> {
  const session = await requireSession();

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { threadId: true },
  });

  if (message === null) {
    return null;
  }

  await requireThreadAccessOrThrow(message.threadId, session.user.id, session.user.role);
  return { session, threadId: message.threadId };
}

export const toggleReaction = createServerAction(
  { schema: toggleReactionSchema, actionName: 'toggleReaction' },
  async ({ messageId, emoji }) => {
    const authorized = await requireMessageAccess(messageId);
    if (authorized === null) {
      return actionFailure('NOT_FOUND', 'Message not found');
    }

    const userId = authorized.session.user.id;
    const existing = await getUserReaction(messageId, userId, emoji);

    if (existing) {
      await removeReaction(messageId, userId, emoji);
    } else {
      await addReaction(messageId, userId, emoji);
    }

    // No revalidation: the client owns this state optimistically and we return
    // the authoritative post-toggle values so it can reconcile in place.
    const hasReacted = !existing;
    const likeCount = await prisma.reaction.count({
      where: { messageId, emoji },
    });
    return actionSuccess({ hasReacted, likeCount });
  }
);

export const getReactionSummary = createServerAction(
  { schema: getReactionSummarySchema, actionName: 'getReactionSummary' },
  async ({ messageId }) => {
    const authorized = await requireMessageAccess(messageId);
    if (authorized === null) {
      return actionFailure('NOT_FOUND', 'Message not found');
    }

    const reactions = await getMessageReactions(messageId, authorized.session.user.id);
    return actionSuccess(reactions);
  }
);

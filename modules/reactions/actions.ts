'use server';

import { z } from 'zod';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth';
import { logger } from '@/lib/infrastructure/logger';
import {
  addReaction,
  removeReaction,
  getMessageReactions,
  getUserReaction,
} from '@/modules/reactions/repository';
import { createServerAction } from '@/lib/utils/server-action';
import { requireReadOrThrow } from '@/lib/thread-access';
import { infraReactionSideEffects } from '@/modules/reactions/adapters/infra-side-effects';
import type { ReactionSideEffectsPort } from '@/modules/reactions/ports/side-effects';
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

  await requireReadOrThrow(message.threadId, session.user.id, session.user.role);
  return { session, threadId: message.threadId };
}

export async function toggleReactionCore(
  input: { messageId: string; emoji: string },
  sideEffects: ReactionSideEffectsPort = infraReactionSideEffects
) {
  const authorized = await requireMessageAccess(input.messageId);
  if (authorized === null) {
    return actionFailure('NOT_FOUND', 'Message not found');
  }

  const { messageId, emoji } = input;
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

  try {
    await sideEffects.recordActivity({
      userId,
      type: hasReacted ? 'REACTION_ADDED' : 'REACTION_REMOVED',
      entityType: 'Message',
      entityId: messageId,
      metadata: { emoji, threadId: authorized.threadId },
    });
  } catch (error) {
    // Best-effort: activity must not fail the toggle.
    logger.warn('[toggleReaction] recordActivity failed', error);
  }

  return actionSuccess({ hasReacted, likeCount });
}

export async function getReactionSummaryCore(input: { messageId: string }) {
  const authorized = await requireMessageAccess(input.messageId);
  if (authorized === null) {
    return actionFailure('NOT_FOUND', 'Message not found');
  }

  const reactions = await getMessageReactions(input.messageId, authorized.session.user.id);
  return actionSuccess(reactions);
}

export const toggleReaction = createServerAction(
  { schema: toggleReactionSchema, actionName: 'toggleReaction' },
  async ({ messageId, emoji }) => toggleReactionCore({ messageId, emoji })
);

export const getReactionSummary = createServerAction(
  { schema: getReactionSummarySchema, actionName: 'getReactionSummary' },
  async ({ messageId }) => getReactionSummaryCore({ messageId })
);

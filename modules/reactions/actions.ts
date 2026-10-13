'use server';

import { z } from 'zod';
import { requireSession } from '@/modules/auth';
import { logger } from '@/lib/infrastructure/logger';
import { getMessageReactions } from '@/modules/reactions/repository';
import { createServerAction } from '@/lib/utils/server-action';
import { requireReadOrThrow } from '@/lib/thread-access';
import { infraReactionSideEffects } from '@/modules/reactions/adapters/infra-side-effects';
import { prismaReactionStore } from '@/modules/reactions/adapters/reaction-store';
import type { ReactionDeps } from '@/modules/reactions/ports/side-effects';
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

async function requireMessageAccess(
  messageId: string,
  store: NonNullable<ReactionDeps['store']> = prismaReactionStore
): Promise<AuthorizedMessage | null> {
  const session = await requireSession();

  const threadId = await store.resolveThreadId(messageId);
  if (threadId === null) {
    return null;
  }

  await requireReadOrThrow(threadId, session.user.id, session.user.role);
  return { session, threadId };
}

export async function toggleReactionCore(
  input: { messageId: string; emoji: string },
  deps: ReactionDeps = {}
) {
  const { sideEffects = infraReactionSideEffects, store = prismaReactionStore } = deps;
  const authorized = await requireMessageAccess(input.messageId, store);
  if (authorized === null) {
    return actionFailure('NOT_FOUND', 'Message not found');
  }

  const { messageId, emoji } = input;
  const userId = authorized.session.user.id;
  const existing = await store.getReaction(messageId, userId, emoji);

  if (existing) {
    await store.removeReaction(messageId, userId, emoji);
  } else {
    await store.addReaction(messageId, userId, emoji);
  }

  // No revalidation: the client owns this state optimistically and we return
  // the authoritative post-toggle values so it can reconcile in place.
  const hasReacted = !existing;
  const likeCount = await store.countByEmoji(messageId, emoji);

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

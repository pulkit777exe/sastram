'use server';

import { requireSession } from '@/modules/auth';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/infrastructure/prisma';
import {
  createPoll as createPollRepo,
  voteOnPoll as voteOnPollRepo,
  closePoll as closePollRepo,
  getPollResults as getPollResultsRepo,
  getUserVote as getUserVoteRepo,
  getPollById as getPollByIdRepo,
  getPollByThreadId as getPollByThreadIdRepo,
  resolveMarketPoll as resolveMarketPollRepo,
} from './repository';
import { createPollSchema, voteOnPollSchema } from './schemas';
import { z } from 'zod';
import { ROUTES } from '@/lib/config/routes';
import { logger } from '@/lib/infrastructure/logger';
import { createServerAction, withValidation } from '@/lib/utils/server-action';
import { AppError, isPrismaUniqueConstraintError } from '@/lib/utils/errors';
import { threadIdSchema } from '@/lib/utils/validation-common';
import { actionFailure, actionSuccess, type ActionErrorCode } from '@/lib/utils/server-action';
import { requireManageOrThrow, requireReadOrThrow } from '@/lib/thread-access';
import { validatePollExpiry } from './validate';
import { rateLimit } from '@/lib/services/rate-limit';
import type { Role } from '@prisma/client';

const pollIdSchema = z.object({ pollId: z.string().cuid() });

const resolveMarketPollSchema = z.object({
  pollId: z.string().cuid(),
  resolvedOptionIndex: z.number().int().min(0),
});

function fail(error: string, errorCode: ActionErrorCode) {
  return actionFailure(errorCode, error);
}

function isVotingClosed(poll: { isActive: boolean; expiresAt: Date | null }): boolean {
  return !poll.isActive || isPollExpired(poll.expiresAt);
}

function validatePollVoteAccess(
  poll: NonNullable<Awaited<ReturnType<typeof getPollByIdRepo>>>
): ReturnType<typeof fail> | null {
  if (isVotingClosed(poll)) {
    return fail('Voting is closed for this poll', 'CONFLICT');
  }
  return null;
}

function internalError() {
  return fail('Something went wrong', 'INTERNAL_ERROR');
}

function pollNotFound() {
  return fail('Poll not found', 'NOT_FOUND');
}

function notAMember() {
  return fail('You are not a member of this thread', 'FORBIDDEN');
}

function revalidatePollThread(slugOrId: string) {
  revalidatePath(ROUTES.THREAD(slugOrId));
}

function toActionErrorCode(code: string | undefined): ActionErrorCode {
  switch (code) {
    case 'AUTH_REQUIRED':
    case 'FORBIDDEN':
    case 'VALIDATION_ERROR':
    case 'NOT_FOUND':
    case 'RATE_LIMITED':
    case 'CONFLICT':
    case 'INTERNAL_ERROR':
      return code;
    default:
      return 'INTERNAL_ERROR';
  }
}

function toActionError(error: unknown) {
  if (AppError.isAppError(error)) {
    const code = toActionErrorCode(error.code);
    return fail(error.message, code);
  }
  return null;
}

function isPollExpired(expiresAt: Date | null): boolean {
  if (expiresAt === null) {
    return false;
  }
  return expiresAt.getTime() < Date.now();
}

function validateOptionIndexBounds(
  poll: NonNullable<Awaited<ReturnType<typeof getPollByIdRepo>>>,
  optionIndex: number
): ReturnType<typeof fail> | null {
  const rawOptions = (poll as unknown as { options: unknown }).options;
  const options = Array.isArray(rawOptions) ? rawOptions : [];
  if (optionIndex < 0 || optionIndex >= options.length) {
    return fail('Invalid option index', 'VALIDATION_ERROR');
  }
  return null;
}

async function checkPollVoteRateLimit(userId: string): Promise<ReturnType<typeof fail> | null> {
  try {
    const rl = await rateLimit({ key: `poll-vote:${userId}`, type: 'api' });
    if (!rl.success) return fail('Too many vote attempts, try later', 'RATE_LIMITED');
    return null;
  } catch {
    return null;
  }
}

export const createPollAction = withValidation(
  createPollSchema,
  'createPoll',
  async ({ threadId, messageId, question, options, expiresAt }) => {
    try {
      const expiryError = validatePollExpiry(expiresAt ?? null);
      if (expiryError) {
        return fail(expiryError, 'VALIDATION_ERROR');
      }
      const session = await requireSession();
      try {
        await requireManageOrThrow(threadId, session.user.id, session.user.role);
      } catch (error) {
        if (AppError.isAppError(error)) {
          if (error.code === 'NOT_FOUND') return fail('Thread not found', 'NOT_FOUND');
          return fail('Insufficient permissions to create poll', 'FORBIDDEN');
        }
        throw error;
      }

      const poll = await createPollRepo(threadId, question, options, expiresAt ?? undefined, messageId);

      logger.info('[createPoll] Poll created', {
        pollId: poll.id,
        threadId,
        messageId,
        createdBy: session.user.id,
      });

      // Revalidate the real thread page — needs the slug, not the id.
      const thread = await prisma.thread.findUnique({ where: { id: threadId }, select: { slug: true } });
      if (thread) revalidatePollThread(thread.slug);
      return actionSuccess(poll);
    } catch (err) {
      logger.error('[createPoll]', { error: err });
      return internalError();
    }
  }
);

export const voteOnPollAction = withValidation(
  voteOnPollSchema,
  'voteOnPoll',
  async ({ pollId, optionIndex }) => {
    try {
      const session = await requireSession();

      const rateLimited = await checkPollVoteRateLimit(session.user.id);
      if (rateLimited) return rateLimited;

      const poll = await getPollByIdRepo(pollId);
      if (poll === null) {
        return pollNotFound();
      }

      const boundsError = validateOptionIndexBounds(poll, optionIndex);
      if (boundsError) return boundsError;

      // Read gate distinguishes thread-not-found (NOT_FOUND → pollNotFound)
      // from no-access (FORBIDDEN → notAMember) in one load.
      try {
        await requireReadOrThrow(poll.threadId, session.user.id, session.user.role);
      } catch (error) {
        if (AppError.isAppError(error)) {
          if (error.code === 'NOT_FOUND') return pollNotFound();
          return notAMember();
        }
        throw error;
      }

      const accessError = validatePollVoteAccess(poll);
      if (accessError !== null) return accessError;

      await voteOnPollRepo(pollId, session.user.id, optionIndex);

      if (poll.thread?.slug) {
        revalidatePollThread(poll.thread.slug);
      }

      return actionSuccess(null);
    } catch (err) {
      if (isPrismaUniqueConstraintError(err)) {
        return fail('You have already voted on this poll', 'CONFLICT');
      }
      logger.error('[voteOnPoll]', { error: err });
      return internalError();
    }
  }
);

export const closePollAction = createServerAction(
  { schema: pollIdSchema, actionName: 'closePoll' },
  async ({ pollId }) => {
    try {
      const session = await requireSession();

      const poll = await getPollByIdRepo(pollId);
      if (poll === null) {
        return pollNotFound();
      }

      await requireManageOrThrow(poll.threadId, session.user.id, session.user.role);

      await closePollRepo(pollId);

      if (poll.thread?.slug) {
        revalidatePollThread(poll.thread.slug);
      }

      return actionSuccess(null);
    } catch (error) {
      if (AppError.isAppError(error)) {
        if (error.code === 'NOT_FOUND') return fail('Thread not found', 'NOT_FOUND');
        if (error.code === 'FORBIDDEN') return fail('Insufficient permissions', 'FORBIDDEN');
      }
      logger.error('[closePoll]', error);
      return internalError();
    }
  }
);

/**
 * Single owner of the Poll Market resolve invariant: existence, market-ness,
 * still-active, option bounds, then manage rights. The
 * `/api/polls/[pollId]/resolve` route is a thin protocol adapter over this —
 * it owns session/rate-limit/transport only.
 */
export const resolveMarketPollAction = createServerAction(
  { schema: resolveMarketPollSchema, actionName: 'resolveMarketPoll' },
  async ({ pollId, resolvedOptionIndex }) => {
    try {
      const session = await requireSession();

      const poll = await getPollByIdRepo(pollId);
      if (poll === null) {
        return pollNotFound();
      }
      if (!poll.isMarket) {
        return fail('Not a market poll', 'VALIDATION_ERROR');
      }
      if (!poll.isActive) {
        return fail('Poll already resolved', 'CONFLICT');
      }

      const boundsError = validateOptionIndexBounds(poll, resolvedOptionIndex);
      if (boundsError !== null) {
        return boundsError;
      }

      try {
        await requireManageOrThrow(poll.threadId, session.user.id, session.user.role);
      } catch (error) {
        const actionError = toActionError(error);
        if (actionError !== null) return actionError;
        return fail('Insufficient permissions', 'FORBIDDEN');
      }

      const updated = await resolveMarketPollRepo(pollId, resolvedOptionIndex);

      if (poll.thread?.slug) {
        revalidatePollThread(poll.thread.slug);
      }

      return actionSuccess({ pollId: updated.id, resolvedOptionIndex: updated.resolvedOptionIndex });
    } catch (error) {
      logger.error('[resolveMarketPoll]', error);
      return internalError();
    }
  }
);

export const getPollResultsAction = createServerAction(
  { schema: pollIdSchema, actionName: 'getPollResults' },
  async ({ pollId }) => {
    try {
      const session = await requireSession();
      const poll = await getPollResultsRepo(pollId);
      if (poll === null) {
        return pollNotFound();
      }
      const fullPoll = await getPollByIdRepo(pollId);
      if (fullPoll?.threadId) {
        await requireReadOrThrow(fullPoll.threadId, session.user.id, session.user.role as Role);
      }
      return actionSuccess(poll);
    } catch (error) {
      if (AppError.isAppError(error)) {
        throw error;
      }
      logger.error('[getPollResults]', error);
      return internalError();
    }
  }
);

export const getUserVoteAction = createServerAction(
  { schema: pollIdSchema, actionName: 'getUserVote' },
  async ({ pollId }) => {
    try {
      const session = await requireSession();
      const vote = await getUserVoteRepo(pollId, session.user.id);
      return actionSuccess(vote);
    } catch (error) {
      logger.error('[getUserVote]', error);
      return internalError();
    }
  }
);

export const getPollByThreadAction = createServerAction(
  { schema: threadIdSchema, actionName: 'getPollByThread' },
  async ({ threadId }) => {
    try {
      const session = await requireSession();
      await requireReadOrThrow(threadId, session.user.id, session.user.role as Role);
      const poll = await getPollByThreadIdRepo(threadId);
      if (poll === null) {
        return pollNotFound();
      }
      return actionSuccess(poll);
    } catch (error) {
      const mapped = toActionError(error);
      if (mapped !== null) {
        return mapped;
      }
      logger.error('[getPollByThread]', error);
      return internalError();
    }
  }
);

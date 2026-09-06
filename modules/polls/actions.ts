'use server';

import { requireSession } from '@/modules/auth';
import { revalidatePath } from 'next/cache';
import {
  createPoll as createPollRepo,
  voteOnPoll as voteOnPollRepo,
  closePoll as closePollRepo,
  getPollResults as getPollResultsRepo,
  getUserVote as getUserVoteRepo,
  getPollById as getPollByIdRepo,
  getPollByThreadId as getPollByThreadIdRepo,
} from './repository';
import { createPollSchema, voteOnPollSchema } from './schemas';
import { z } from 'zod';
import { ROUTES } from '@/lib/config/routes';
import { getMemberRole } from '@/modules/members';
import { logger } from '@/lib/infrastructure/logger';
import { createServerAction, withValidation } from '@/lib/utils/server-action';
import { AppError, isPrismaUniqueConstraintError } from '@/lib/utils/errors';
import { threadIdSchema } from '@/lib/utils/validation-common';
import { actionFailure, actionSuccess, type ActionErrorCode } from '@/lib/actions/result';
import { requireThreadAccessOrThrow } from '@/lib/thread-access';
import type { Role } from '@prisma/client';

const pollIdSchema = z.object({ pollId: z.string().cuid() });

const MANAGER_ROLES = ['OWNER', 'MODERATOR'];

function fail(error: string, errorCode: ActionErrorCode) {
  return actionFailure(errorCode, error);
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

function canClosePoll(memberRole: { role: string } | null, userRole: string): boolean {
  if (userRole === 'ADMIN') {
    return true;
  }
  if (memberRole === null) {
    return false;
  }
  return MANAGER_ROLES.includes(memberRole.role);
}

function isStandalonePoll(messageId: string | null | undefined): boolean {
  return messageId === undefined || messageId === null;
}

function canCreateStandalonePoll(memberRole: { role: string } | null): boolean {
  if (memberRole === null) return false;
  return MANAGER_ROLES.includes(memberRole.role);
}

function isVotingClosed(poll: { isActive: boolean; expiresAt: Date | null }): boolean {
  return !poll.isActive || isPollExpired(poll.expiresAt);
}

async function assertThreadAccess(threadId: string, userId: string, role: Role) {
  await requireThreadAccessOrThrow(threadId, userId, role);
}

// ── Fetch helpers ──────────────────────────────────────────────────────────
async function fetchPollForVote(pollId: string) {
  return getPollByIdRepo(pollId);
}

async function fetchPollForClose(pollId: string) {
  return getPollByIdRepo(pollId);
}

function validatePollVoteAccess(
  poll: NonNullable<Awaited<ReturnType<typeof getPollByIdRepo>>>,
  memberRole: { role: string } | null
): ReturnType<typeof fail> | null {
  if (isVotingClosed(poll)) {
    return fail('Voting is closed for this poll', 'CONFLICT');
  }
  if (memberRole === null) {
    return notAMember();
  }
  return null;
}

async function applyVote(pollId: string, userId: string, optionIndex: number) {
  await voteOnPollRepo(pollId, userId, optionIndex);
}

export const createPollAction = withValidation(
  createPollSchema,
  'createPoll',
  async ({ threadId, messageId, question, options, expiresAt }) => {
    try {
      const session = await requireSession();
      const memberRole = await getMemberRole(threadId, session.user.id);

      if (isStandalonePoll(messageId)) {
        if (!canCreateStandalonePoll(memberRole)) {
          return fail('Insufficient permissions to create poll', 'FORBIDDEN');
        }
      } else {
        if (memberRole === null) {
          return notAMember();
        }
      }

      const poll = await createPollRepo(threadId, question, options, expiresAt ?? undefined, messageId);

      logger.info('[createPoll] Poll created', {
        pollId: poll.id,
        threadId,
        messageId,
        createdBy: session.user.id,
      });

      revalidatePollThread(threadId);
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

      const poll = await fetchPollForVote(pollId);
      if (poll === null) {
        return pollNotFound();
      }

      const memberRole = await getMemberRole(poll.threadId, session.user.id);
      const accessError = validatePollVoteAccess(poll, memberRole);
      if (accessError !== null) return accessError;

      await applyVote(pollId, session.user.id, optionIndex);

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

      const poll = await fetchPollForClose(pollId);
      if (poll === null) {
        return pollNotFound();
      }

      const memberRole = await getMemberRole(poll.threadId, session.user.id);
      if (!canClosePoll(memberRole, session.user.role)) {
        return fail('Insufficient permissions', 'FORBIDDEN');
      }

      await closePollRepo(pollId);

      if (poll.thread?.slug) {
        revalidatePollThread(poll.thread.slug);
      }

      return actionSuccess(null);
    } catch (error) {
      logger.error('[closePoll]', error);
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
        await assertThreadAccess(fullPoll.threadId, session.user.id, session.user.role as Role);
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

export const getPollByIdAction = createServerAction(
  { schema: pollIdSchema, actionName: 'getPollById' },
  async ({ pollId }) => {
    try {
      const session = await requireSession();
      const poll = await getPollByIdRepo(pollId);
      if (poll === null) {
        return pollNotFound();
      }
      await assertThreadAccess(poll.threadId, session.user.id, session.user.role as Role);
      return actionSuccess(poll);
    } catch (error) {
      const mapped = toActionError(error);
      if (mapped !== null) {
        return mapped;
      }
      logger.error('[getPollById]', error);
      return internalError();
    }
  }
);

export const getPollByThreadAction = createServerAction(
  { schema: threadIdSchema, actionName: 'getPollByThread' },
  async ({ threadId }) => {
    try {
      const session = await requireSession();
      await assertThreadAccess(threadId, session.user.id, session.user.role as Role);
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

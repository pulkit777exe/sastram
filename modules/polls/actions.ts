'use server';

import { requireSession } from '@/modules/auth/session';
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
import { isPrismaUniqueConstraintError } from '@/lib/utils/errors';
import { threadIdSchema } from '@/lib/utils/validation-common';
import type { ActionErrorCode } from '@/lib/actions/result';

const pollIdSchema = z.object({ pollId: z.string().cuid() });

const MANAGER_ROLES = ['OWNER', 'MODERATOR'];

const fail = (error: string, errorCode: ActionErrorCode) =>
  ({ data: null, error, ok: false, errorCode }) as const;
const internalError = () => fail('Something went wrong', 'INTERNAL_ERROR');
const pollNotFound = () => fail('Poll not found', 'NOT_FOUND');
const notAMember = () => fail('You are not a member of this thread', 'FORBIDDEN');

export const createPollAction = withValidation(
  createPollSchema,
  'createPoll',
  async ({ threadId, messageId, question, options, expiresAt }) => {
    try {
      const session = await requireSession();
      const memberRole = await getMemberRole(threadId, session.user.id);

      // Thread-level polls are an owner/mod call; a poll attached to a message can
      // be created by anyone who belongs to the thread.
      if (!messageId) {
        if (!memberRole || !MANAGER_ROLES.includes(memberRole.role)) {
          return fail('Insufficient permissions to create poll', 'FORBIDDEN');
        }
      } else if (!memberRole) {
        return notAMember();
      }

      const poll = await createPollRepo(threadId, question, options, expiresAt, messageId);

      logger.info('[createPoll] Poll created', {
        pollId: poll.id,
        threadId,
        messageId,
        createdBy: session.user.id,
      });

      revalidatePath(ROUTES.THREAD(threadId));
      return { data: poll, error: null, ok: true, errorCode: null };
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

      const poll = await getPollByIdRepo(pollId);
      if (!poll) return pollNotFound();

      const expired = poll.expiresAt !== null && poll.expiresAt.getTime() < Date.now();
      if (!poll.isActive || expired) {
        return fail('Voting is closed for this poll', 'CONFLICT');
      }

      const memberRole = await getMemberRole(poll.threadId, session.user.id);
      if (!memberRole) return notAMember();

      await voteOnPollRepo(pollId, session.user.id, optionIndex);

      if (poll.thread?.slug) {
        revalidatePath(ROUTES.THREAD(poll.thread.slug));
      }

      return { data: null, error: null, ok: true, errorCode: null };
    } catch (err) {
      // One vote per user is enforced by a unique index, not a pre-check.
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
      if (!poll) return pollNotFound();

      const memberRole = await getMemberRole(poll.threadId, session.user.id);
      const canClose =
        (memberRole && MANAGER_ROLES.includes(memberRole.role)) || session.user.role === 'ADMIN';
      if (!canClose) return fail('Insufficient permissions', 'FORBIDDEN');

      await closePollRepo(pollId);

      if (poll.thread?.slug) {
        revalidatePath(ROUTES.THREAD(poll.thread.slug));
      }

      return { data: null, error: null, ok: true, errorCode: null };
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
      const poll = await getPollResultsRepo(pollId);
      if (!poll) return pollNotFound();
      return { data: poll, error: null, ok: true, errorCode: null };
    } catch (error) {
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
      return { data: vote, error: null, ok: true, errorCode: null };
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
      const poll = await getPollByIdRepo(pollId);
      if (!poll) return pollNotFound();
      return { data: poll, error: null, ok: true, errorCode: null };
    } catch (error) {
      logger.error('[getPollById]', error);
      return internalError();
    }
  }
);

export const getPollByThreadAction = createServerAction(
  { schema: threadIdSchema, actionName: 'getPollByThread' },
  async ({ threadId }) => {
    try {
      const poll = await getPollByThreadIdRepo(threadId);
      if (!poll) return pollNotFound();
      return { data: poll, error: null, ok: true, errorCode: null };
    } catch (error) {
      logger.error('[getPollByThread]', error);
      return internalError();
    }
  }
);

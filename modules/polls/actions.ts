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
import { getMemberRole } from '@/modules/members/repository';
import { logger } from '@/lib/infrastructure/logger';
import { createServerAction, withValidation } from '@/lib/utils/server-action';
import { isPrismaUniqueConstraintError } from '@/lib/utils/errors';

const pollIdSchema = z.object({ pollId: z.string().cuid() });
const threadIdSchema = z.object({ threadId: z.string().cuid() });

export const createPollAction = withValidation(
  createPollSchema,
  'createPoll',
  async ({ threadId, question, options, expiresAt }) => {
    try {
      const session = await requireSession();
      const memberRole = await getMemberRole(threadId, session.user.id);
      if (!memberRole || !['OWNER', 'MODERATOR'].includes(memberRole.role)) {
        return { data: null, error: 'Insufficient permissions to create poll', ok: false, errorCode: 'FORBIDDEN' };
      }

      const poll = await createPollRepo(
        threadId,
        question,
        options,
        expiresAt
      );

      logger.info('[createPoll] Poll created', {
        pollId: poll.id,
        threadId,
        createdBy: session.user.id,
      });

      revalidatePath(ROUTES.THREAD(threadId));
      return { data: poll, error: null, ok: true, errorCode: null };
    } catch (err) {
      logger.error('[createPoll]', { error: err });
      return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
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
      if (!poll) {
        return { data: null, error: 'Poll not found', ok: false, errorCode: 'NOT_FOUND' };
      }
      if (!poll.isActive) {
        return { data: null, error: 'Voting is closed for this poll', ok: false, errorCode: 'CONFLICT' };
      }
      if (poll.expiresAt && poll.expiresAt.getTime() < Date.now()) {
        return { data: null, error: 'Voting is closed for this poll', ok: false, errorCode: 'CONFLICT' };
      }

      await voteOnPollRepo(pollId, session.user.id, optionIndex);

      if (poll.thread?.slug) {
        revalidatePath(ROUTES.THREAD(poll.thread.slug));
      }

      return { data: null, error: null, ok: true, errorCode: null };
    } catch (err) {
      if (isPrismaUniqueConstraintError(err)) {
        return { data: null, error: 'You have already voted on this poll', ok: false, errorCode: 'CONFLICT' };
      }
      logger.error('[voteOnPoll]', { error: err });
      return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);

export const closePollAction = createServerAction(
  {
    schema: pollIdSchema,
    actionName: 'closePoll',
  },
  async ({ pollId }) => {
    try {
      const session = await requireSession();

      const poll = await getPollByIdRepo(pollId);
      if (!poll) {
        return { data: null, error: 'Poll not found', ok: false, errorCode: 'NOT_FOUND' };
      }

      const memberRole = await getMemberRole(poll.threadId, session.user.id);
      if (!memberRole || !['OWNER', 'MODERATOR'].includes(memberRole.role)) {
        if (session.user.role !== 'ADMIN') {
          return { data: null, error: 'Insufficient permissions', ok: false, errorCode: 'FORBIDDEN' };
        }
      }

      await closePollRepo(pollId);

      if (poll.thread?.slug) {
        revalidatePath(ROUTES.THREAD(poll.thread.slug));
      }

      return { data: null, error: null, ok: true, errorCode: null };
    } catch (error) {
      logger.error('[closePoll]', error);
      return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);

export const getPollResultsAction = createServerAction(
  {
    schema: pollIdSchema,
    actionName: 'getPollResults',
  },
  async ({ pollId }) => {
    try {
      const poll = await getPollResultsRepo(pollId);
      if (!poll) {
        return { data: null, error: 'Poll not found', ok: false, errorCode: 'NOT_FOUND' };
      }
      return { data: poll, error: null, ok: true, errorCode: null };
    } catch (error) {
      logger.error('[getPollResults]', error);
      return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);

export const getUserVoteAction = createServerAction(
  {
    schema: pollIdSchema,
    actionName: 'getUserVote',
  },
  async ({ pollId }) => {
    try {
      const session = await requireSession();
      const vote = await getUserVoteRepo(pollId, session.user.id);
      return { data: vote, error: null, ok: true, errorCode: null };
    } catch (error) {
      logger.error('[getUserVote]', error);
      return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);

export const getPollByIdAction = createServerAction(
  {
    schema: pollIdSchema,
    actionName: 'getPollById',
  },
  async ({ pollId }) => {
    try {
      const poll = await getPollByIdRepo(pollId);
      if (!poll) {
        return { data: null, error: 'Poll not found', ok: false, errorCode: 'NOT_FOUND' };
      }
      return { data: poll, error: null, ok: true, errorCode: null };
    } catch (error) {
      logger.error('[getPollById]', error);
      return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);

export const getPollByThreadAction = createServerAction(
  {
    schema: threadIdSchema,
    actionName: 'getPollByThread',
  },
  async ({ threadId }) => {
    try {
      const poll = await getPollByThreadIdRepo(threadId);
      if (!poll) {
        return { data: null, error: 'Poll not found', ok: false, errorCode: 'NOT_FOUND' };
      }
      return { data: poll, error: null, ok: true, errorCode: null };
    } catch (error) {
      logger.error('[getPollByThread]', error);
      return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);
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
import { getMemberRole } from '@/modules/members/repository';
import { logger } from '@/lib/infrastructure/logger';
import { createServerAction } from '@/lib/utils/server-action';
import { withValidation } from '@/lib/utils/server-action';

// ── HELPERS ────────────────────────────────────────────────────────────────

const pollIdSchema = z.object({ pollId: z.string().cuid() });
const threadIdSchema = z.object({ threadId: z.string().cuid() });

// Detects Prisma unique constraint violation (P2002)
function isPrismaUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  );
}

// ── CREATE POLL ────────────────────────────────────────────────────────────

export const createPollAction = withValidation(
  createPollSchema,
  'createPoll',
  async ({ threadId, question, options, expiresAt }) => {
    try {
      // requireSession enforces auth — session.user.id available for audit if needed
      const session = await requireSession();

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

      revalidatePath(`/dashboard/threads/thread/${threadId}`);
      return { data: poll, error: null };
    } catch (err) {
      logger.error('[createPoll]', { error: err });
      return { data: null, error: 'Something went wrong' };
    }
  }
);

// ── VOTE ON POLL ───────────────────────────────────────────────────────────

export const voteOnPollAction = withValidation(
  voteOnPollSchema,
  'voteOnPoll',
  async ({ pollId, optionIndex }) => {
    try {
      const session = await requireSession();

      const poll = await getPollByIdRepo(pollId);
      if (!poll) {
        return { data: null, error: 'Poll not found' };
      }
      if (!poll.isActive) {
        return { data: null, error: 'Voting is closed for this poll' };
      }
      if (poll.expiresAt && poll.expiresAt.getTime() < Date.now()) {
        return { data: null, error: 'Voting is closed for this poll' };
      }

      // No pre-check for existing vote here — the DB unique constraint handles it.
      // voteOnPollRepo will throw a Prisma P2002 error if already voted.
      await voteOnPollRepo(pollId, session.user.id, optionIndex);

      if (poll.thread?.slug) {
        revalidatePath(`/dashboard/threads/thread/${poll.thread.slug}`);
      }

      return { data: null, error: null };
    } catch (err) {
      if (isPrismaUniqueConstraintError(err)) {
        return { data: null, error: 'You have already voted on this poll' };
      }
      logger.error('[voteOnPoll]', { error: err });
      return { data: null, error: 'Something went wrong' };
    }
  }
);

// ── CLOSE POLL ────────────────────────────────────────────────────────────

export const closePollAction = createServerAction(
  {
    schema: pollIdSchema,
    actionName: 'closePoll',
    requireAuth: true,
  },
  async ({ pollId }) => {
    try {
      const session = await requireSession();

      const poll = await getPollByIdRepo(pollId);
      if (!poll) {
        return { data: null, error: 'Poll not found' };
      }

      // Check if user has permission to close poll
      const memberRole = await getMemberRole(poll.threadId, session.user.id);
      if (!memberRole || !['OWNER', 'MODERATOR'].includes(memberRole.role)) {
        if (session.user.role !== 'ADMIN') {
          return { data: null, error: 'Insufficient permissions' };
        }
      }

      await closePollRepo(pollId);

      if (poll.thread?.slug) {
        revalidatePath(`/dashboard/threads/thread/${poll.thread.slug}`);
      }

      return { data: null, error: null };
    } catch (error) {
      logger.error('[closePoll]', error);
      return { data: null, error: 'Something went wrong' };
    }
  }
);

// ── GET POLL RESULTS ───────────────────────────────────────────────────────

export const getPollResultsAction = createServerAction(
  {
    schema: pollIdSchema,
    actionName: 'getPollResults',
    requireAuth: true,
  },
  async ({ pollId }) => {
    try {
      const poll = await getPollResultsRepo(pollId);
      if (!poll) {
        return { data: null, error: 'Poll not found' };
      }
      return { data: poll, error: null };
    } catch (error) {
      logger.error('[getPollResults]', error);
      return { data: null, error: 'Something went wrong' };
    }
  }
);

// ── GET USER VOTE ──────────────────────────────────────────────────────────

export const getUserVoteAction = createServerAction(
  {
    schema: pollIdSchema,
    actionName: 'getUserVote',
    requireAuth: true,
  },
  async ({ pollId }) => {
    try {
      const session = await requireSession();
      const vote = await getUserVoteRepo(pollId, session.user.id);
      return { data: vote, error: null };
    } catch (error) {
      logger.error('[getUserVote]', error);
      return { data: null, error: 'Something went wrong' };
    }
  }
);

// ── GET POLL BY ID ────────────────────────────────────────────────────────

export const getPollByIdAction = createServerAction(
  {
    schema: pollIdSchema,
    actionName: 'getPollById',
  },
  async ({ pollId }) => {
    try {
      const poll = await getPollByIdRepo(pollId);
      if (!poll) {
        return { data: null, error: 'Poll not found' };
      }
      return { data: poll, error: null };
    } catch (error) {
      logger.error('[getPollById]', error);
      return { data: null, error: 'Something went wrong' };
    }
  }
);

// ── GET POLL BY THREAD ────────────────────────────────────────────────────

export const getPollByThreadAction = createServerAction(
  {
    schema: threadIdSchema,
    actionName: 'getPollByThread',
  },
  async ({ threadId }) => {
    try {
      const poll = await getPollByThreadIdRepo(threadId);
      if (!poll) {
        return { data: null, error: 'Poll not found' };
      }
      return { data: poll, error: null };
    } catch (error) {
      logger.error('[getPollByThread]', error);
      return { data: null, error: 'Something went wrong' };
    }
  }
);
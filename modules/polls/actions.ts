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

export async function createPollAction(
  threadId: string,
  question: string,
  options: string[],
  expiresAt?: Date
) {
  const parsed = createPollSchema.safeParse({ threadId, question, options, expiresAt });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    // requireSession enforces auth — session.user.id available for audit if needed
    const session = await requireSession();

    const poll = await createPollRepo(
      parsed.data.threadId,
      parsed.data.question,
      parsed.data.options,
      parsed.data.expiresAt
    );

    logger.info('[createPollAction] Poll created', {
      pollId: poll.id,
      threadId: parsed.data.threadId,
      createdBy: session.user.id,
    });

    revalidatePath(`/dashboard/threads/thread/${parsed.data.threadId}`);
    return { data: poll, error: null };
  } catch (err) {
    logger.error('[createPollAction]', { error: err });
    return { data: null, error: 'Something went wrong' };
  }
}

// ── VOTE ON POLL ───────────────────────────────────────────────────────────

export async function voteOnPollAction(pollId: string, optionIndex: number) {
  const parsed = voteOnPollSchema.safeParse({ pollId, optionIndex });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();

    const poll = await getPollByIdRepo(parsed.data.pollId);
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
    await voteOnPollRepo(parsed.data.pollId, session.user.id, parsed.data.optionIndex);

    if (poll.thread?.slug) {
      revalidatePath(`/dashboard/threads/thread/${poll.thread.slug}`);
    }

    return { data: null, error: null };
  } catch (err) {
    // Unique constraint = already voted
    if (isPrismaUniqueConstraintError(err)) {
      return { data: null, error: 'You have already voted on this poll' };
    }
    logger.error('[voteOnPollAction]', { error: err });
    return { data: null, error: 'Something went wrong' };
  }
}

// ── GET POLL RESULTS ───────────────────────────────────────────────────────

export async function getPollResultsAction(pollId: string) {
  const parsed = pollIdSchema.safeParse({ pollId });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const results = await getPollResultsRepo(parsed.data.pollId);
    if (!results) {
      return { data: null, error: 'Poll not found' };
    }
    return { data: results, error: null };
  } catch (err) {
    logger.error('[getPollResultsAction]', { error: err });
    return { data: null, error: 'Something went wrong' };
  }
}

// ── GET USER VOTE ──────────────────────────────────────────────────────────

export async function getUserVoteAction(pollId: string) {
  const parsed = pollIdSchema.safeParse({ pollId });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    const vote = await getUserVoteRepo(parsed.data.pollId, session.user.id);
    return { data: vote, error: null };
  } catch (err) {
    logger.error('[getUserVoteAction]', { error: err });
    return { data: null, error: 'Something went wrong' };
  }
}

// ── GET POLL BY THREAD ─────────────────────────────────────────────────────

export async function getPollByThreadAction(threadId: string) {
  const parsed = threadIdSchema.safeParse({ threadId });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const poll = await getPollByThreadIdRepo(parsed.data.threadId);
    return { data: poll, error: null };
  } catch (err) {
    logger.error('[getPollByThreadAction]', { error: err });
    return { data: null, error: 'Something went wrong' };
  }
}

// ── CLOSE POLL ─────────────────────────────────────────────────────────────

export async function closePollAction(pollId: string) {
  const parsed = pollIdSchema.safeParse({ pollId });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();

    // getPollById already includes thread.createdBy (fixed in repository.ts)
    // so we only need one query to get everything we need for auth
    const poll = await getPollByIdRepo(parsed.data.pollId);
    if (!poll) {
      return { data: null, error: 'Poll not found' };
    }

    // Check thread creator first (no extra DB query needed)
    const isThreadCreator = poll.thread?.createdBy === session.user.id;

    // Check member role only if not thread creator
    let hasModeratorRole = false;
    if (!isThreadCreator && poll.threadId) {
      const memberRole = await getMemberRole(poll.threadId, session.user.id);
      hasModeratorRole = !!memberRole && ['OWNER', 'MODERATOR'].includes(memberRole.role);
    }

    if (!isThreadCreator && !hasModeratorRole) {
      return { data: null, error: 'Insufficient permissions' };
    }

    await closePollRepo(parsed.data.pollId);

    if (poll.thread?.slug) {
      revalidatePath(`/dashboard/threads/thread/${poll.thread.slug}`);
    }

    return { data: null, error: null };
  } catch (err) {
    logger.error('[closePollAction]', { error: err });
    return { data: null, error: 'Something went wrong' };
  }
}

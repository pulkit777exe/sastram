import { prisma } from '@/lib/infrastructure/prisma';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

// ── SCHEMA ─────────────────────────────────────────────────────────────────
// Parse poll.options from Prisma Json field safely.
// If the DB value is malformed, this throws early with a clear error
// instead of causing a silent runtime crash downstream.

const optionsSchema = z.array(z.string());

function parsePollOptions(raw: Prisma.JsonValue): string[] {
  const result = optionsSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`[Poll] options field has unexpected shape: ${result.error.message}`);
  }
  return result.data;
}

// ── CREATE ─────────────────────────────────────────────────────────────────

export async function createPoll(
  threadId: string,
  question: string,
  options: string[],
  expiresAt?: Date
) {
  return prisma.poll.create({
    data: {
      threadId,
      question,
      options: options as Prisma.InputJsonValue,
      expiresAt,
      isActive: true,
    },
  });
}

// ── VOTE ───────────────────────────────────────────────────────────────────
// The unique constraint on [pollId, userId] in the DB enforces one-vote-per-user.
// We do NOT pre-check for an existing vote here — that would be an extra
// round trip for every vote. Instead the action catches the constraint error.

export async function voteOnPoll(pollId: string, userId: string, optionIndex: number) {
  return prisma.pollVote.create({
    data: { pollId, userId, optionIndex },
  });
}

// ── CLOSE ──────────────────────────────────────────────────────────────────

export async function closePoll(pollId: string) {
  return prisma.poll.update({
    where: { id: pollId },
    data: { isActive: false },
  });
}

// ── GET BY ID ──────────────────────────────────────────────────────────────

export async function getPollById(pollId: string) {
  return prisma.poll.findUnique({
    where: { id: pollId },
    select: {
      id: true,
      threadId: true,
      isActive: true,
      expiresAt: true,
      thread: {
        select: {
          id: true,
          slug: true,
          // Include createdBy here so closePollAction doesn't need
          // a separate query to check thread ownership
          createdBy: true,
        },
      },
    },
  });
}

// ── GET RESULTS ────────────────────────────────────────────────────────────
// Uses DB-level aggregation (groupBy) instead of loading all vote rows
// into Node.js memory. At 10,000 votes this is critical for performance.

export async function getPollResults(pollId: string) {
  const [poll, voteCounts] = await Promise.all([
    prisma.poll.findUnique({
      where: { id: pollId },
      select: {
        id: true,
        question: true,
        options: true,
        isActive: true,
        expiresAt: true,
        _count: { select: { votes: true } },
      },
    }),
    prisma.pollVote.groupBy({
      by: ['optionIndex'],
      where: { pollId },
      _count: { optionIndex: true },
    }),
  ]);

  if (!poll) return null;

  // Parse options through Zod — throws clearly if shape is wrong
  const options = parsePollOptions(poll.options);
  const totalVotes = poll._count.votes;

  // Build a lookup map: optionIndex → count
  const countByIndex = new Map<number, number>(
    voteCounts.map((row) => [row.optionIndex, row._count.optionIndex])
  );

  return {
    poll: {
      id: poll.id,
      question: poll.question,
      options,
      isActive: poll.isActive,
      expiresAt: poll.expiresAt,
      totalVotes,
    },
    results: options.map((option, index) => {
      const votes = countByIndex.get(index) ?? 0;
      return {
        option,
        index,
        votes,
        percentage: totalVotes > 0 ? (votes / totalVotes) * 100 : 0,
      };
    }),
  };
}

// ── GET USER VOTE ──────────────────────────────────────────────────────────

export async function getUserVote(pollId: string, userId: string) {
  return prisma.pollVote.findUnique({
    where: { pollId_userId: { pollId, userId } },
  });
}

// ── GET BY THREAD ──────────────────────────────────────────────────────────

export async function getPollByThreadId(threadId: string) {
  return prisma.poll.findUnique({
    where: { threadId },
    include: {
      _count: { select: { votes: true } },
    },
  });
}

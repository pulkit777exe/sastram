import { prisma } from '@/lib/infrastructure/prisma';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

const optionsSchema = z.array(z.string());

// Throw loudly on a malformed Json column rather than letting `undefined`
// options leak into the UI.
function parsePollOptions(raw: Prisma.JsonValue): string[] {
  const result = optionsSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`[Poll] options field has unexpected shape: ${result.error.message}`);
  }
  return result.data;
}

export async function createPoll(
  threadId: string,
  question: string,
  options: string[],
  expiresAt?: Date,
  messageId?: string
) {
  return prisma.poll.create({
    data: {
      threadId,
      messageId,
      question,
      options: options as Prisma.InputJsonValue,
      expiresAt,
      isActive: true,
    },
  });
}

// The unique constraint on [pollId, userId] is the one-vote-per-user check —
// a pre-read would just add a round trip. The action handles the conflict.
export async function voteOnPoll(pollId: string, userId: string, optionIndex: number) {
  return prisma.pollVote.create({
    data: { pollId, userId, optionIndex },
  });
}

export async function closePoll(pollId: string) {
  return prisma.poll.update({
    where: { id: pollId },
    data: { isActive: false },
  });
}

export async function getPollById(pollId: string) {
  return prisma.poll.findUnique({
    where: { id: pollId },
    select: {
      id: true,
      threadId: true,
      isActive: true,
      expiresAt: true,
      thread: { select: { id: true, slug: true, createdBy: true } },
    },
  });
}

export async function getPollResults(pollId: string) {
  // groupBy keeps the tally in the DB instead of pulling every vote row.
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

  const options = parsePollOptions(poll.options);
  const totalVotes = poll._count.votes;

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

export async function getUserVote(pollId: string, userId: string) {
  return prisma.pollVote.findUnique({
    where: { pollId_userId: { pollId, userId } },
  });
}

export async function getPollByThreadId(threadId: string) {
  return prisma.poll.findFirst({
    where: { message: { threadId } },
    include: { _count: { select: { votes: true } } },
  });
}

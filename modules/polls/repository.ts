import { prisma } from "@/lib/infrastructure/prisma";

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
      options: options as any, // JSON field
      expiresAt,
      isActive: true,
    },
  });
}

export async function voteOnPoll(pollId: string, userId: string, optionIndex: number) {
  // Check if already voted
  const existing = await prisma.pollVote.findUnique({
    where: {
      pollId_userId: {
        pollId,
        userId,
      },
    },
  });

  if (existing) {
    // Update existing vote
    return prisma.pollVote.update({
      where: { id: existing.id },
      data: { optionIndex },
    });
  }

  return prisma.pollVote.create({
    data: {
      pollId,
      userId,
      optionIndex,
    },
  });
}

export async function getPollResults(pollId: string) {
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: {
      votes: true,
      _count: {
        select: {
          votes: true,
        },
      },
    },
  });

  if (!poll) {
    return null;
  }

  const options = poll.options as string[];
  const voteCounts = new Array(options.length).fill(0);

  poll.votes.forEach((vote) => {
    if (vote.optionIndex >= 0 && vote.optionIndex < options.length) {
      voteCounts[vote.optionIndex]++;
    }
  });

  return {
    poll: {
      id: poll.id,
      question: poll.question,
      options,
      isActive: poll.isActive,
      expiresAt: poll.expiresAt,
      totalVotes: poll._count.votes,
    },
    results: options.map((option, index) => ({
      option,
      index,
      votes: voteCounts[index],
      percentage:
        poll._count.votes > 0 ? (voteCounts[index] / poll._count.votes) * 100 : 0,
    })),
  };
}

export async function getUserVote(pollId: string, userId: string) {
  const vote = await prisma.pollVote.findUnique({
    where: {
      pollId_userId: {
        pollId,
        userId,
      },
    },
  });

  return vote;
}

export async function getPollByThreadId(threadId: string) {
  return prisma.poll.findUnique({
    where: { threadId },
    include: {
      _count: {
        select: {
          votes: true,
        },
      },
    },
  });
}


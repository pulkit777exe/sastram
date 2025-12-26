import { prisma } from "@/lib/infrastructure/prisma";

export async function getUserReputation(userId: string) {
  let reputation = await prisma.userReputation.findUnique({
    where: { userId },
  });

  if (!reputation) {
    // Create initial reputation record
    reputation = await prisma.userReputation.create({
      data: {
        userId,
        points: 0,
        level: 1,
      },
    });
  }

  return reputation;
}

export async function awardReputation(
  userId: string,
  points: number,
  reason: string
) {
  const reputation = await getUserReputation(userId);
  const newPoints = reputation.points + points;
  const newLevel = calculateLevel(newPoints);

  return prisma.userReputation.update({
    where: { userId },
    data: {
      points: newPoints,
      level: newLevel,
    },
  });
}

export async function calculateReputationPoints(userId: string) {
  const [threadCount, messageCount, reactionCount, followerCount] = await Promise.all([
    prisma.section.count({
      where: {
        createdBy: userId,
        deletedAt: null,
      },
    }),
    prisma.message.count({
      where: {
        senderId: userId,
        deletedAt: null,
      },
    }),
    prisma.reaction.count({
      where: {
        message: {
          senderId: userId,
        },
      },
    }),
    prisma.userFollow.count({
      where: {
        followingId: userId,
      },
    }),
  ]);

  // Calculate points:
  // - 10 points per thread created
  // - 1 point per message
  // - 5 points per reaction received
  // - 2 points per follower
  const points =
    threadCount * 10 + messageCount * 1 + reactionCount * 5 + followerCount * 2;

  return points;
}

export async function syncReputationPoints(userId: string) {
  const calculatedPoints = await calculateReputationPoints(userId);
  const level = calculateLevel(calculatedPoints);

  return prisma.userReputation.upsert({
    where: { userId },
    update: {
      points: calculatedPoints,
      level,
    },
    create: {
      userId,
      points: calculatedPoints,
      level,
    },
  });
}

function calculateLevel(points: number): number {
  // Level calculation: sqrt(points / 100) + 1
  // This gives a logarithmic progression
  return Math.floor(Math.sqrt(points / 100)) + 1;
}


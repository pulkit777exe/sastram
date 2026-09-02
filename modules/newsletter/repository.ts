import type { DigestFrequency } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';

export async function subscribeToThreadNewsletter({
  threadId,
  userId,
  email,
  frequency,
}: {
  threadId: string;
  userId?: string;
  email?: string;
  frequency?: DigestFrequency;
}) {
  if (!userId && !email) {
    throw new Error('Either userId or email is required for thread subscription');
  }

  if (!userId) {
    return prisma.threadSubscription.upsert({
      where: {
        threadId_email: {
          threadId,
          email: email!,
        },
      },
      update: frequency ? { frequency } : {},
      create: {
        threadId,
        email: email!,
        ...(frequency ? { frequency } : {}),
      },
    });
  }

  return prisma.threadSubscription.upsert({
    where: {
      threadId_userId: {
        threadId,
        userId,
      },
    },
    update: {
      email,
      ...(frequency ? { frequency } : {}),
    },
    create: {
      threadId,
      userId,
      email,
      ...(frequency ? { frequency } : {}),
    },
  });
}

export async function getThreadTranscript(threadId: string) {
  try {
    return (
      (await prisma.message.findMany({
        where: { threadId: threadId, deletedAt: null },
        include: {
          sender: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: 500,
      })) ?? []
    );
  } catch (error) {
    logger.error('[getThreadTranscript]', error);
    return [];
  }
}

export async function listThreadSubscribers(threadId: string) {
  try {
    return (
      (await prisma.threadSubscription.findMany({
        where: { threadId, isActive: true },
      })) ?? []
    );
  } catch (error) {
    logger.error('[listThreadSubscribers]', error);
    return [];
  }
}

export async function isUserSubscribedToThread(threadId: string, userId: string) {
  const subscription = await prisma.threadSubscription.findFirst({
    where: { threadId, userId, isActive: true },
  });
  return Boolean(subscription);
}

export async function updateSubscriptionFrequency({
  threadId,
  userId,
  frequency,
}: {
  threadId: string;
  userId: string;
  frequency: DigestFrequency;
}) {
  return prisma.threadSubscription.update({
    where: {
      threadId_userId: {
        threadId,
        userId,
      },
    },
    data: {
      frequency,
    },
  });
}

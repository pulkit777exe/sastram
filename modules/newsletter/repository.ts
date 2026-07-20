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

import type { DigestFrequency } from '@prisma/client';

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

/**
 * Schedules a digest for a thread (placeholder implementation)
 */
export async function scheduleThreadDigest(threadId: string) {
  logger.info(`Scheduling digest for thread ${threadId}`);
  return Promise.resolve();
}

/**
 * Gets due digests (placeholder implementation)
 */
export async function getDueDigests() {
  return Promise.resolve([] as Array<{ id: string; threadId: string }>);
}

/**
 * Marks a digest as processing (placeholder — ThreadDigest model not yet added)
 */
export async function markDigestProcessing(digestId: string) {
  logger.info(`Marking digest ${digestId} as processing (stub)`);
  return Promise.resolve();
}

export async function completeDigest(digestId: string, summary: string, emailCount: number) {
  logger.info(`Completing digest ${digestId} with ${emailCount} emails sent`);
  return Promise.resolve();
}

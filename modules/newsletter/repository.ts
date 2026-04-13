import { prisma } from "@/lib/infrastructure/prisma";
import { logger } from "@/lib/infrastructure/logger";

export async function subscribeToThreadNewsletter({
  threadId,
  userId,
  email,
}: {
  threadId: string;
  userId?: string;
  email?: string;
}) {
  if (!userId && !email) {
    throw new Error("Either userId or email is required for thread subscription");
  }

  if (!userId) {
    return prisma.threadSubscription.upsert({
      where: {
        threadId_email: {
          threadId,
          email: email!,
        },
      },
      update: {},
      create: {
        threadId,
        email: email!,
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
    },
    create: {
      threadId,
      userId,
      email,
    },
  });
}

export async function getThreadTranscript(threadId: string) {
  try {
    return (
      (await prisma.message.findMany({
        where: { sectionId: threadId },
        include: {
          sender: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      })) ?? []
    );
  } catch (error) {
    logger.error("[getThreadTranscript]", error);
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
    logger.error("[listThreadSubscribers]", error);
    return [];
  }
}

export async function isUserSubscribedToThread(threadId: string, userId: string) {
  const subscription = await prisma.threadSubscription.findFirst({
    where: { threadId, userId, isActive: true },
  });
  return Boolean(subscription);
}

import { DigestFrequency } from "@prisma/client";

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
  console.log(`Scheduling digest for thread ${threadId}`);
  return Promise.resolve();
}

/**
 * Gets due digests (placeholder implementation)
 */
export async function getDueDigests() {
  return Promise.resolve([] as Array<{ id: string; threadId: string }>);
}

/**
 * Marks a digest as processing (placeholder implementation)
 */
export async function markDigestProcessing(digestId: string) {
  console.log(`Marking digest ${digestId} as processing`);
  return Promise.resolve();
}

/**
 * Completes a digest (placeholder implementation)
 */
export async function completeDigest(digestId: string, summary: string, emailCount: number) {
  console.log(`Completing digest ${digestId} with ${emailCount} emails sent`);
  return Promise.resolve();
}

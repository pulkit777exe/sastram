import type { DigestFrequency, Prisma } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';

const TRANSCRIPT_SENDER_SELECT = { id: true, name: true, email: true, image: true } as const;

function buildAnonymousSubscriptionUpsert(threadId: string, email: string, frequency?: DigestFrequency) {
  const updateData: Prisma.ThreadSubscriptionUpdateInput = {};
  if (frequency) {
    updateData.frequency = frequency;
  }
  const createData: Prisma.ThreadSubscriptionCreateInput = {
    thread: { connect: { id: threadId } },
    email,
  };
  if (frequency) {
    (createData as Prisma.ThreadSubscriptionCreateInput).frequency = frequency;
  }
  return { updateData, createData };
}

function buildUserSubscriptionUpsert(threadId: string, userId: string, email: string | undefined, frequency?: DigestFrequency) {
  const updateData: Prisma.ThreadSubscriptionUpdateInput = {};
  if (email) {
    updateData.email = email;
  }
  if (frequency) {
    updateData.frequency = frequency;
  }
  const createData: Prisma.ThreadSubscriptionCreateInput = {
    thread: { connect: { id: threadId } },
    user: { connect: { id: userId } },
    email: email ?? '',
  };
  if (frequency) {
    (createData as Prisma.ThreadSubscriptionCreateInput).frequency = frequency;
  }
  return { updateData, createData };
}

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
    const { updateData, createData } = buildAnonymousSubscriptionUpsert(threadId, email!, frequency);
    return prisma.threadSubscription.upsert({
      where: { threadId_email: { threadId, email: email! } },
      update: updateData,
      create: createData,
    });
  }

  const { updateData: updateDataWithUser, createData: createDataWithUser } = buildUserSubscriptionUpsert(
    threadId,
    userId,
    email,
    frequency
  );
  return prisma.threadSubscription.upsert({
    where: { threadId_userId: { threadId, userId } },
    update: updateDataWithUser,
    create: createDataWithUser,
  });
}

export async function getThreadTranscript(threadId: string) {
  try {
    return (
      (await prisma.message.findMany({
        where: { threadId: threadId, deletedAt: null },
        include: {
          sender: { select: TRANSCRIPT_SENDER_SELECT },
        },
        orderBy: { createdAt: 'asc' },
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

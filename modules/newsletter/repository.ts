import { prisma } from "@/lib/infrastructure/prisma";

export async function subscribeToThreadNewsletter({
  threadId,
  userId,
  email,
}: {
  threadId: string;
  userId?: string;
  email: string;
}) {
  if (!userId) {
    throw new Error("UserId is required for thread subscription");
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
  return prisma.message.findMany({
    where: { sectionId: threadId },
    include: {
      sender: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

export async function listThreadSubscribers(threadId: string) {
  return prisma.threadSubscription.findMany({
    where: { threadId, isActive: true },
  });
}

export async function isUserSubscribedToThread(threadId: string, userId: string) {
  const subscription = await prisma.threadSubscription.findFirst({
    where: { threadId, userId, isActive: true },
  });
  return Boolean(subscription);
}

// Stub functions for missing digest functionality
export async function scheduleThreadDigest(threadId: string) {
  // TODO: Implement digest scheduling
  return Promise.resolve();
}

export async function getDueDigests() {
  // TODO: Implement due digests retrieval
  return Promise.resolve([] as Array<{ id: string; threadId: string }>);
}

export async function markDigestProcessing(digestId: string) {
  // TODO: Implement digest processing marking
  return Promise.resolve();
}

export async function completeDigest(digestId: string, summary: string, emailCount: number) {
  // TODO: Implement digest completion
  return Promise.resolve();
}

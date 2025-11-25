import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";

export async function subscribeToThreadNewsletter({
  threadId,
  userId,
  email,
}: {
  threadId: string;
  userId?: string;
  email: string;
}) {
  return prisma.newsletterSubscription.upsert({
    where: {
      threadId_email: {
        threadId,
        email,
      },
    },
    update: {
      userId,
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

export async function scheduleThreadDigest(threadId: string) {
  return prisma.threadDigest.upsert({
    where: {
      threadId_scheduledFor: {
        threadId,
        scheduledFor: addDays(new Date(), 1),
      },
    },
    update: {},
    create: {
      threadId,
      scheduledFor: addDays(new Date(), 1),
      status: "PENDING",
    },
  });
}

export async function getDueDigests() {
  return prisma.threadDigest.findMany({
    where: {
      status: "PENDING",
      scheduledFor: {
        lte: new Date(),
      },
    },
    include: {
      thread: {
        include: {
          messages: {
            include: {
              sender: true,
            },
          },
        },
      },
    },
  });
}

export async function listThreadSubscribers(threadId: string) {
  return prisma.newsletterSubscription.findMany({
    where: { threadId },
  });
}

export async function isUserSubscribedToThread(threadId: string, userId: string) {
  const subscription = await prisma.newsletterSubscription.findFirst({
    where: { threadId, userId },
  });
  return Boolean(subscription);
}

export async function markDigestProcessing(digestId: string) {
  return prisma.threadDigest.update({
    where: { id: digestId },
    data: {
      status: "PROCESSING",
    },
  });
}

export async function completeDigest(digestId: string, summary: string, emailCount: number) {
  return prisma.threadDigest.update({
    where: { id: digestId },
    data: {
      status: "SENT",
      processedAt: new Date(),
      summary,
      emailCount,
    },
  });
}


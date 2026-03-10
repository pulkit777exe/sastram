import { addDays } from "date-fns";
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
  return prisma.threadSubscription.upsert({
    where: {
      threadId_userId: {
        threadId,
        userId: userId!,
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

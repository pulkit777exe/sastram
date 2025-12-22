import { prisma } from "@/lib/prisma";

/**
 * Queue a message for a user who is offline
 */
export async function queueMessageForUser(
  userId: string,
  sectionId: string,
  messageId: string
): Promise<void> {
  await prisma.messageQueue.create({
    data: {
      userId,
      sectionId,
      messageId,
    },
  });
}

/**
 * Get all queued messages for a user in a specific section
 */
export async function getQueuedMessages(userId: string, sectionId: string) {
  const queuedItems = await prisma.messageQueue.findMany({
    where: {
      userId,
      sectionId,
      delivered: false,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return queuedItems.map((item) => item.messageId);
}

/**
 * Mark messages as delivered
 */
export async function markMessagesAsDelivered(
  userId: string,
  messageIds: string[]
): Promise<void> {
  await prisma.messageQueue.updateMany({
    where: {
      userId,
      messageId: {
        in: messageIds,
      },
    },
    data: {
      delivered: true,
    },
  });
}

/**
 * Queue message for all offline users in a section
 */
export async function queueMessageForOfflineUsers(
  sectionId: string,
  messageId: string,
  onlineUserIds: string[]
): Promise<void> {
  // Get all users who have ever participated in this section
  const participants = await prisma.message.findMany({
    where: {
      sectionId,
    },
    select: {
      senderId: true,
    },
    distinct: ["senderId"],
  });

  const participantIds = participants.map((p) => p.senderId);
  const offlineUserIds = participantIds.filter(
    (id) => !onlineUserIds.includes(id)
  );

  // Queue for offline users
  if (offlineUserIds.length > 0) {
    await prisma.messageQueue.createMany({
      data: offlineUserIds.map((userId) => ({
        userId,
        sectionId,
        messageId,
      })),
      skipDuplicates: true,
    });
  }
}

import { prisma } from "@/lib/infrastructure/prisma";

/**
 * Queue a message for a user who is offline
 * Note: MessageQueue model not implemented yet - this is a placeholder
 */
export async function queueMessageForUser(
  userId: string,
  sectionId: string,
  messageId: string
): Promise<void> {
  // TODO: Implement message queue when MessageQueue model is added
  // await prisma.messageQueue.create({
  //   data: {
  //     userId,
  //     sectionId,
  //     messageId,
  //   },
  // });
}

/**
 * Get all queued messages for a user in a specific section
 */
export async function getQueuedMessages(userId: string, sectionId: string) {
  // TODO: Implement message queue when MessageQueue model is added
  // const queuedItems = await prisma.messageQueue.findMany({
  //   where: {
  //     userId,
  //     sectionId,
  //     delivered: false,
  //   },
  //   orderBy: {
  //     createdAt: "asc",
  //   },
  // });
  // return queuedItems.map((item) => item.messageId);
  return [];
}

/**
 * Mark messages as delivered
 */
export async function markMessagesAsDelivered(
  userId: string,
  messageIds: string[]
): Promise<void> {
  // TODO: Implement message queue when MessageQueue model is added
  // await prisma.messageQueue.updateMany({
  //   where: {
  //     userId,
  //     messageId: {
  //       in: messageIds,
  //     },
  //   },
  //   data: {
  //     delivered: true,
  //   },
  // });
}

/**
 * Queue message for all offline users in a section
 */
export async function queueMessageForOfflineUsers(
  sectionId: string,
  messageId: string,
  onlineUserIds: string[]
): Promise<void> {
  // TODO: Implement message queue when MessageQueue model is added
  // Get all users who have ever participated in this section
  // const participants = await prisma.message.findMany({
  //   where: {
  //     sectionId,
  //   },
  //   select: {
  //     senderId: true,
  //   },
  //   distinct: ["senderId"],
  // });
  // const participantIds = participants.map((p) => p.senderId);
  // const offlineUserIds = participantIds.filter(
  //   (id) => !onlineUserIds.includes(id)
  // );
  // if (offlineUserIds.length > 0) {
  //   await prisma.messageQueue.createMany({
  //     data: offlineUserIds.map((userId) => ({
  //       userId,
  //       sectionId,
  //       messageId,
  //     })),
  //     skipDuplicates: true,
  //   });
  // }
}

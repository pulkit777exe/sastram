"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireSession, assertAdmin } from "@/modules/auth/session";
import { emitMessageDeleted } from "@/modules/ws/publisher";

/**
 * Delete a message (admin only)
 */
export async function deleteMessageAction(
  messageId: string,
  sectionSlug: string
) {
  const session = await requireSession();
  assertAdmin(session.user);

  try {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { sectionId: true },
    });

    if (!message) {
      return { error: "Message not found" };
    }

    // Delete the message
    await prisma.message.delete({
      where: { id: messageId },
    });

    // Emit WebSocket event
    emitMessageDeleted(message.sectionId, messageId);

    // Revalidate the thread page
    revalidatePath(`/thread/${sectionSlug}`);

    return { success: true };
  } catch (error) {
    console.error("Failed to delete message:", error);
    return { error: "Failed to delete message" };
  }
}

/**
 * Ban user from thread (admin only)
 * Note: This is a placeholder - full implementation would require a BannedUser table
 */
export async function banUserFromThread(
  userId: string,
  threadId: string,
  reason?: string
) {
  const session = await requireSession();
  assertAdmin(session.user);

  // TODO: Implement ban logic with a BannedUser table
  // For now, this is a placeholder
  console.log(`Ban user ${userId} from thread ${threadId}. Reason: ${reason}`);

  return {
    success: true,
    message: "Ban functionality pending full implementation",
  };
}

/**
 * Get message with full details (for moderation)
 */
export async function getMessageDetails(messageId: string) {
  const session = await requireSession();
  assertAdmin(session.user);

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
      attachments: true,
      section: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
  });

  return message;
}

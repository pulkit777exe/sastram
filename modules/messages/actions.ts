"use server";

import { prisma } from "@/lib/infrastructure/prisma";
import { auth } from "@/lib/services/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { filterBadLanguage } from "@/lib/services/content-safety";
import { emitThreadMessage } from "@/modules/ws/publisher";
import { createMessageWithAttachmentsSchema } from "@/lib/schemas/database";
import { messageLimiter } from "@/lib/services/rate-limit";
import { getMemberRole } from "@/modules/members/repository";
import { logAction } from "@/modules/audit/repository";
import { handleError } from "@/lib/utils/errors";
import { validate } from "@/lib/utils/validation";
import { editMessageSchema, pinMessageSchema, getMessageEditHistorySchema } from "./schemas";
import { AuditAction } from "@prisma/client";

function handleActionError(error: unknown) {
  return handleError(error);
}

export async function postMessage(formData: FormData) {
  const content = formData.get("content") as string;
  const sectionId = formData.get("sectionId") as string;
  const parentId = formData.get("parentId") as string | null;
  const mentionsRaw = formData.get("mentions") as string | null;

  let mentions: string[] | undefined;
  if (mentionsRaw) {
    try {
      mentions = JSON.parse(mentionsRaw);
    } catch {
      return { error: "Invalid mentions format" };
    }
  }

  const validation = createMessageWithAttachmentsSchema.safeParse({
    content,
    sectionId,
    parentId: parentId || undefined,
    mentions,
  });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message || "Invalid message data",
    };
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  // Rate limiting
  try {
    await messageLimiter.check(session.user.id);
  } catch {
    return { error: "Rate limit exceeded. Please slow down." };
  }

  // Content filtering
  const safeContent = filterBadLanguage(content);

  try {
    // Use transaction for all database operations
    const result = await prisma.$transaction(async (tx) => {
      // Calculate depth for nested replies
      let depth = 0;
      if (parentId) {
        const parent = await tx.message.findUnique({
          where: { id: parentId },
          select: { depth: true },
        });
        depth = (parent?.depth || 0) + 1;
      }

      // Create message
      const message = await tx.message.create({
        data: {
          content: safeContent,
          sectionId: sectionId,
          senderId: session.user.id,
          parentId: parentId || null,
          depth,
        },
        include: {
          section: {
            select: {
              slug: true,
            },
          },
          sender: {
            select: {
              name: true,
              image: true,
            },
          },
          attachments: true, 
        },
      });
      

      // Create mentions
      if (mentions && mentions.length > 0) {
        await tx.messageMention.createMany({
          data: mentions.map((userId) => ({
            messageId: message.id,
            userId,
          })),
        });

        // Create notifications for mentions
        for (const userId of mentions) {
          await tx.notification.create({
            data: {
              userId,
              type: "MENTION",
              title: "You were mentioned",
              message: `${
                session.user.name || session.user.email
              } mentioned you in a message`,
              data: {
                messageId: message.id,
                sectionId: sectionId,
              },
            },
          });
        }
      }

      // Update message count
      await tx.section.update({
        where: { id: sectionId },
        data: {
          messageCount: {
            increment: 1,
          },
        },
      });

      return message;
    });

    // Emit WebSocket event (outside transaction)
    const payload = {
      id: result.id,
      content: result.content,
      senderId: session.user.id,
      senderName: result.sender?.name || session.user.email,
      senderAvatar: result.sender?.image ?? session.user.image,
      createdAt: result.createdAt,
      sectionId,
    };

    emitThreadMessage(sectionId, {
      type: "NEW_MESSAGE",
      payload,
    });

    if (result.section?.slug) {
      revalidatePath(`/dashboard/threads/thread/${result.section.slug}`);
    }
    revalidatePath("/dashboard");

    return { success: true, data: result };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function editMessage(messageId: string, content: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const validation = validate(editMessageSchema, { messageId, content });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    // Check if user owns the message
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true, content: true, sectionId: true },
    });

    if (!message) {
      return { error: "Message not found" };
    }

    if (message.senderId !== session.user.id) {
      return { error: "You can only edit your own messages" };
    }

    // Save edit history
    await prisma.messageEdit.create({
      data: {
        messageId,
        content: message.content,
      },
    });

    // Update message
    const safeContent = filterBadLanguage(content);
    await prisma.message.update({
      where: { id: messageId },
      data: {
        content: safeContent,
        isEdited: true,
      },
    });

    revalidatePath("/dashboard/threads");
    return { success: true };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function pinMessage(messageId: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const validation = validate(pinMessageSchema, { messageId });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        isPinned: true,
        sectionId: true,
        section: {
          select: { slug: true },
        },
      },
    });

    if (!message) {
      return { error: "Message not found" };
    }

    // Check if user has permission (moderator or owner)
    const memberRole = await getMemberRole(message.sectionId, session.user.id);

    if (!memberRole || !["OWNER", "MODERATOR"].includes(memberRole.role)) {
      return {
        error:
          "Insufficient permissions. Only moderators and owners can pin messages.",
      };
    }

    await prisma.message.update({
      where: { id: messageId },
      data: { isPinned: !message.isPinned },
    });

    await logAction({
      action: message.isPinned ? AuditAction.MESSAGE_UPDATED : AuditAction.MESSAGE_UPDATED,
      entityType: "Message",
      entityId: messageId,
      performedBy: session.user.id,
    });

    revalidatePath(`/dashboard/threads/thread/${message.section?.slug}`);
    return { success: true };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function getMessageEditHistory(messageId: string) {
  const validation = validate(getMessageEditHistorySchema, { messageId });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    const edits = await prisma.messageEdit.findMany({
      where: { messageId },
      orderBy: {
        editedAt: "desc",
      },
    });

    return { success: true, data: edits };
  } catch (error) {
    return handleActionError(error);
  }
}


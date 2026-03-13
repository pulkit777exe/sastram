"use server";

import { prisma } from "@/lib/infrastructure/prisma";
import { auth } from "@/lib/services/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { filterBadLanguage } from "@/lib/services/content-safety";
import { emitThreadMessage, emitMentionNotification } from "@/modules/ws/publisher";
import { createMessageWithAttachmentsSchema } from "@/lib/schemas/database";
import { messageLimiter } from "@/lib/services/rate-limit";
import { MessageService } from "@/lib/services/moderation";
import { getMemberRole } from "@/modules/members/repository";
import { logAction } from "@/modules/audit/repository";
import {
  editMessageSchema,
  pinMessageSchema,
  getMessageEditHistorySchema,
} from "./schemas";

import { parseMentions, resolveUserMentions } from "@/lib/utils/mention-parser";
import { sendMentionNotification } from "@/lib/services/email";
import { recordActivity } from "@/modules/activity/repository";

function handleActionError(actionName: string, error: unknown) {
  console.error(`[${actionName}]`, error);
  return { data: null, error: "Something went wrong" };
}

export async function postMessage(formData: FormData) {
  const content = formData.get("content") as string;
  const sectionId = formData.get("sectionId") as string;
  const parentId = formData.get("parentId") as string | null;
  const mentionsRaw = formData.get("mentions") as string | null;

  // Parse mentions from content and combine with explicit mentions
  const parsedMentions = parseMentions(content);
  let mentions: string[] | undefined;

  if (mentionsRaw) {
    try {
      const explicitMentions = JSON.parse(mentionsRaw) as string[];
      // Resolve usernames from parsed mentions to user IDs
      const resolvedMentions = await resolveUserMentions(
        parsedMentions.usernames,
        prisma,
      );
      // Combine explicit mentions (already user IDs) with resolved mentions
      mentions = Array.from(
        new Set([...explicitMentions, ...resolvedMentions]),
      );
    } catch {
      // If explicit mentions fail, try to resolve parsed mentions
      mentions = await resolveUserMentions(parsedMentions.usernames, prisma);
    }
  } else {
    // Only parse mentions from content
    mentions = await resolveUserMentions(parsedMentions.usernames, prisma);
  }

  const validation = createMessageWithAttachmentsSchema.safeParse({
    content,
    sectionId,
    parentId: parentId || undefined,
    mentions,
  });

  if (!validation.success) {
    return {
      data: null,
      error: "Invalid input",
    };
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { data: null, error: "Something went wrong" };
  }

  // Rate limiting
  try {
    await messageLimiter.check(session.user.id);
  } catch {
    return { data: null, error: "Rate limit exceeded. Please slow down." };
  }

  // Content filtering
  const safeContent = filterBadLanguage(content);

  try {
    const messageService = new MessageService();

    const recentMessages = await prisma.message.findMany({
      where: { sectionId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        content: true,
        senderId: true,
        createdAt: true,
      },
    });

    const section = await prisma.section.findUnique({
      where: { id: sectionId },
      select: {
        id: true,
        name: true,
        visibility: true,
        createdBy: true,
      },
    });

    const context = {
      sectionId,
      participantIds: [session.user.id],
      recentHistory: recentMessages,
      sectionMetadata: {
        visibility: section?.visibility,
        name: section?.name,
        createdBy: section?.createdBy,
      },
      relationships: new Map(),
    };

    const result = await messageService.processMessage(
      {
        id: "",
        content: safeContent,
        authorId: session.user.id,
        sectionId,
        parentId,
        timestamp: new Date(),
        metadata: { edited: false },
      },
      context,
    );

    if (!result.success) {
      return {
        data: { pendingModeration: result.pendingModeration ?? null },
        error: result.reason || "Message blocked by content filter",
      };
    }

    const message = await prisma.message.findUniqueOrThrow({
      where: { id: result.messageId! },
      include: {
        section: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        sender: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        attachments: true,
      },
    });

    // Create mentions
    if (mentions && mentions.length > 0) {
      await prisma.messageMention.createMany({
        data: mentions.map((userId) => ({
          messageId: message.id,
          userId,
        })),
      });

      // Create notifications for mentions (emails sent outside transaction)
      for (const userId of mentions) {
        await prisma.notification.create({
          data: {
            userId,
            type: "MENTION",
            title: "You were mentioned",
            message: `${
              session.user.name || session.user.email
            } mentioned you in a message`,
            data: {
              messageId: message.id,
              sectionId,
            },
          },
        });

        emitMentionNotification(sectionId, {
          messageId: message.id,
          mentionedUserId: userId,
          mentionedBy: session.user.id,
          mentionedByName: session.user.name || session.user.email,
          sectionId,
          content: message.content,
          parentId: message.parentId ?? undefined,
        });
      }
    }

    // Send email notifications for mentions (outside transaction)
    if (mentions && mentions.length > 0) {
      const thread = await prisma.section.findUnique({
        where: { id: sectionId },
        select: { name: true, slug: true },
      });

      if (thread) {
        const threadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/threads/thread/${thread.slug}`;

        for (const userId of mentions) {
          const mentionedUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, name: true },
          });

          if (mentionedUser) {
            sendMentionNotification(
              mentionedUser.email,
              session.user.name || session.user.email,
              thread.name,
              safeContent.substring(0, 200),
              threadUrl,
            ).catch((error) => {
              console.error("Failed to send mention email:", error);
            });
          }
        }
      }
    }

    // Emit WebSocket event (outside transaction)
    const payload = {
      id: message.id,
      content: message.content,
      senderId: session.user.id,
      senderName: message.sender?.name || session.user.email,
      senderAvatar: message.sender?.image ?? session.user.image,
      createdAt: message.createdAt,
      sectionId,
      parentId: message.parentId ?? null,
      depth: message.depth ?? 0,
      likeCount: 0,
      replyCount: 0,
      isAiResponse: false,
      reactions: [],
      attachments: message.attachments.map((att) => ({
        id: att.id,
        url: att.url,
        type: att.type,
        name: att.name,
        size: att.size !== null ? Number(att.size) : null,
      })),
    };

    emitThreadMessage(sectionId, payload);

    if (message.section?.slug) {
      revalidatePath(`/dashboard/threads/thread/${message.section.slug}`);
    }
    revalidatePath("/dashboard");

    // Record activity for message posted
    await recordActivity({
      userId: session.user.id,
      type: "MESSAGE_POSTED",
      entityType: "Message",
      entityId: message.id,
      metadata: {
        sectionId,
        threadName: message.section?.slug,
      },
    });

    return {
      data: {
        message,
        pendingModeration: result.pendingModeration,
      },
      error: null,
    };
  } catch (error) {
    return handleActionError("postMessage", error);
  }
}

export async function editMessage(messageId: string, content: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { data: null, error: "Something went wrong" };
  }

  const validation = editMessageSchema.safeParse({ messageId, content });
  if (!validation.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    // Check if user owns the message
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true, content: true, sectionId: true },
    });

    if (!message) {
      return { data: null, error: "Message not found" };
    }

    if (message.senderId !== session.user.id) {
      return { data: null, error: "You can only edit your own messages" };
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
    return { data: null, error: null };
  } catch (error) {
    return handleActionError("editMessage", error);
  }
}

export async function pinMessage(messageId: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { data: null, error: "Something went wrong" };
  }

  const validation = pinMessageSchema.safeParse({ messageId });
  if (!validation.success) {
    return { data: null, error: "Invalid input" };
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
      return { data: null, error: "Message not found" };
    }

    // Check if user has permission (moderator or owner)
    const memberRole = await getMemberRole(message.sectionId, session.user.id);

    if (!memberRole || !["OWNER", "MODERATOR"].includes(memberRole.role)) {
      return {
        data: null,
        error:
          "Insufficient permissions. Only moderators and owners can pin messages.",
      };
    }

    await prisma.message.update({
      where: { id: messageId },
      data: { isPinned: !message.isPinned },
    });

    await logAction({
      action: message.isPinned
        ? "MESSAGE_UPDATED"
        : "MESSAGE_UPDATED",
      entityType: "Message",
      entityId: messageId,
      userId: session.user.id,
    });

    revalidatePath(`/dashboard/threads/thread/${message.section?.slug}`);
    return { data: null, error: null };
  } catch (error) {
    return handleActionError("pinMessage", error);
  }
}

export async function getMessageEditHistory(messageId: string) {
  const validation = getMessageEditHistorySchema.safeParse({ messageId });
  if (!validation.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const edits = await prisma.messageEdit.findMany({
      where: { messageId: validation.data.messageId },
      orderBy: {
        editedAt: "desc",
      },
    });

    return { data: edits, error: null };
  } catch (error) {
    return handleActionError("getMessageEditHistory", error);
  }
}

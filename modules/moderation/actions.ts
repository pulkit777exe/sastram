"use server";

import { prisma } from "@/lib/infrastructure/prisma";
import { revalidatePath } from "next/cache";
import { requireSession, assertAdmin } from "@/modules/auth/session";
import { emitMessageDeleted } from "@/modules/ws/publisher";
import { logAction } from "@/modules/audit/repository";
import { rateLimit } from "@/lib/services/rate-limit";
import { createNotification } from "@/modules/notifications/repository";
import { z } from "zod";
import { handleError } from "@/lib/utils/errors";
import { validate } from "@/lib/utils/validation";
import { AuditAction } from "@prisma/client";
import {
  banUserSchema,
  deleteMessageSchema,
  deleteEntitySchema,
  getBannedUsersSchema,
  getMessageDetailsSchema,
  getModerationQueueSchema,
} from "./schemas";

async function applyModerationRateLimit(userId: string) {
  try {
    const result = await rateLimit({ key: userId, type: "api" });
    if (!result.success) {
      throw new Error("Rate limit exceeded. Please slow down.");
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Rate limit exceeded. Please slow down.");
  }
}

async function validateModerationTarget(
  targetUserId: string,
  moderatorId: string,
  moderatorRole: string
) {
  if (targetUserId === moderatorId) {
    throw new Error("Cannot perform moderation actions on yourself");
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      role: true,
      status: true,
      name: true,
      email: true,
    },
  });

  if (!targetUser) {
    throw new Error("Target user not found");
  }

  if (targetUser.role === "ADMIN" && moderatorRole !== "SUPER_ADMIN") {
    throw new Error("Cannot moderate administrator accounts");
  }

  return targetUser;
}

async function validateEntityForDeletion(
  entityType: "message" | "section" | "community",
  entityId: string
) {
  let entity;

  switch (entityType) {
    case "message":
      entity = await prisma.message.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          deletedAt: true,
          sectionId: true,
          senderId: true,
          section: {
            select: {
              name: true,
              slug: true,
            },
          },
        },
      });
      break;
    case "section":
      entity = await prisma.section.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          deletedAt: true,
          name: true,
          slug: true,
          messageCount: true,
          memberCount: true,
        },
      });
      break;
    case "community":
      entity = await prisma.community.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          deletedAt: true,
          title: true,
          slug: true,
        },
      });
      break;
  }

  if (!entity) {
    throw new Error(`${entityType} not found`);
  }

  if (entity.deletedAt) {
    throw new Error(`${entityType} already deleted`);
  }

  return entity;
}

export async function deleteMessageAction(
  messageId: string,
  sectionSlug: string,
  reason?: string
) {
  const session = await requireSession();
  await assertAdmin(session.user);

  const validation = validate(deleteMessageSchema, {
    messageId,
    sectionSlug,
    reason,
  });

  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    await applyModerationRateLimit(session.user.id);
  } catch (error) {
    return { error: (error as Error).message };
  }

  try {
    const message = await validateEntityForDeletion("message", messageId);

    // Type guard: ensure it's a message entity
    if (!("sectionId" in message)) {
      return { error: "Invalid entity type" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.message.update({
        where: { id: messageId },
        data: { deletedAt: new Date() },
      });

      await tx.section.update({
        where: { id: message.sectionId },
        data: {
          messageCount: {
            decrement: 1,
          },
        },
      });

      await tx.notification.create({
        data: {
          userId: message.senderId,
          type: "SYSTEM",
          title: "Message Deleted",
          message: reason
            ? `Your message was deleted by a moderator. Reason: ${reason}`
            : "Your message was deleted by a moderator.",
          data: {
            messageId,
            sectionSlug,
            deletedBy: session.user.id,
          },
        },
      });
    });

    await logAction({
      action: "MESSAGE_DELETED",
      entityType: "Message",
      entityId: messageId,
      performedBy: session.user.id,
      details: {
        reason,
        sectionSlug,
        originalAuthor: message.senderId,
      },
    });

    emitMessageDeleted(message.sectionId, messageId);

    revalidatePath(`/dashboard/threads/thread/${sectionSlug}`);
    revalidatePath("/dashboard/admin/moderation");

    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function bulkDeleteMessages(
  messageIds: string[],
  reason?: string
) {
  const session = await requireSession();
  await assertAdmin(session.user);

  if (!messageIds || messageIds.length === 0) {
    return { error: "No messages provided" };
  }

  if (messageIds.length > 100) {
    return { error: "Cannot delete more than 100 messages at once" };
  }

  try {
    await applyModerationRateLimit(session.user.id);
  } catch (error) {
    return { error: (error as Error).message };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const messages = await tx.message.findMany({
        where: {
          id: { in: messageIds },
          deletedAt: null,
        },
        select: {
          id: true,
          sectionId: true,
          senderId: true,
        },
      });

      if (messages.length === 0) {
        throw new Error("No valid messages found to delete");
      }

      await tx.message.updateMany({
        where: {
          id: { in: messages.map((m) => m.id) },
        },
        data: {
          deletedAt: new Date(),
        },
      });

      const sectionCounts = messages.reduce((acc, msg) => {
        acc[msg.sectionId] = (acc[msg.sectionId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      for (const [sectionId, count] of Object.entries(sectionCounts)) {
        await tx.section.update({
          where: { id: sectionId },
          data: {
            messageCount: {
              decrement: count,
            },
          },
        });
      }

      const uniqueSenders = [...new Set(messages.map((m) => m.senderId))];

      for (const senderId of uniqueSenders) {
        const userMessageCount = messages.filter(
          (m) => m.senderId === senderId
        ).length;

        await tx.notification.create({
          data: {
            userId: senderId,
            type: "SYSTEM",
            title: "Messages Deleted",
            message: reason
              ? `${userMessageCount} of your messages were deleted by a moderator. Reason: ${reason}`
              : `${userMessageCount} of your messages were deleted by a moderator.`,
          },
        });
      }

      return { deletedCount: messages.length };
    });

    await logAction({
      action: AuditAction.MESSAGE_DELETED,
      entityType: "Message",
      entityId: "bulk",
      performedBy: session.user.id,
      details: {
        messageIds,
        reason,
        count: result.deletedCount,
        bulk: true,
      },
    });

    revalidatePath("/dashboard/admin/moderation");

    return {
      success: true,
      deletedCount: result.deletedCount,
    };
  } catch (error) {
    return handleError(error);
  }
}

export async function banUser(
  userId: string,
  reason: string,
  customReason?: string,
  threadId?: string,
  expiresAt?: Date
) {
  const session = await requireSession();
  await assertAdmin(session.user);

  const validation = validate(banUserSchema, {
    userId,
    reason,
    customReason,
    threadId,
    expiresAt,
  });

  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    await applyModerationRateLimit(session.user.id);
  } catch (error) {
    return { error: (error as Error).message };
  }

  try {
    const targetUser = await validateModerationTarget(
      userId,
      session.user.id,
      session.user.role || "ADMIN"
    );

    const existingBan = await prisma.userBan.findFirst({
      where: {
        userId,
        isActive: true,
        threadId: threadId || null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });

    if (existingBan) {
      return {
        error: threadId
          ? "User is already banned from this thread"
          : "User is already globally banned",
      };
    }

    if (threadId) {
      const thread = await prisma.section.findUnique({
        where: { id: threadId },
        select: { id: true, name: true, deletedAt: true },
      });

      if (!thread) {
        return { error: "Thread not found" };
      }

      if (thread.deletedAt) {
        return { error: "Cannot ban from deleted thread" };
      }
    }

    const ban = await prisma.$transaction(async (tx) => {
      const newBan = await tx.userBan.create({
        data: {
          userId: validation.data.userId,
          bannedBy: session.user.id,
          reason: validation.data.reason,
          customReason: validation.data.customReason,
          threadId: validation.data.threadId,
          expiresAt: validation.data.expiresAt,
          isActive: true,
        },
        include: {
          thread: {
            select: {
              name: true,
              slug: true,
            },
          },
        },
      });

      if (!threadId) {
        await tx.user.update({
          where: { id: userId },
          data: { status: "BANNED" },
        });
      }

      const banMessage = threadId
        ? `You have been banned from "${
            newBan.thread?.name || "a thread"
          }". Reason: ${reason}`
        : `Your account has been banned. Reason: ${reason}`;

      await tx.notification.create({
        data: {
          userId,
          type: "BAN",
          title: threadId ? "Thread Ban" : "Account Banned",
          message: customReason ? `${banMessage}. ${customReason}` : banMessage,
          data: {
            banId: newBan.id,
            reason,
            customReason,
            threadId,
            expiresAt: expiresAt?.toISOString(),
            bannedBy: session.user.id,
          },
        },
      });

      return newBan;
    });

    await logAction({
      action: "USER_BANNED",
      entityType: "User",
      entityId: userId,
      userId: userId,
      performedBy: session.user.id,
      details: {
        reason: validation.data.reason,
        customReason: validation.data.customReason,
        threadId: validation.data.threadId,
        expiresAt: validation.data.expiresAt,
        targetUserEmail: targetUser.email,
        targetUserName: targetUser.name,
      },
    });

    revalidatePath("/dashboard/admin/moderation");
    revalidatePath("/dashboard");

    return {
      success: true,
      banId: ban.id,
      expiresAt: ban.expiresAt,
    };
  } catch (error) {
    return handleError(error);
  }
}

export async function unbanUser(banId: string) {
  const session = await requireSession();
  await assertAdmin(session.user);

  if (!banId || !z.string().cuid().safeParse(banId).success) {
    return { error: "Invalid ban ID" };
  }

  try {
    await applyModerationRateLimit(session.user.id);
  } catch (error) {
    return { error: (error as Error).message };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const ban = await tx.userBan.findUnique({
        where: { id: banId },
        select: {
          userId: true,
          threadId: true,
          isActive: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      if (!ban) {
        throw new Error("Ban not found");
      }

      if (!ban.isActive) {
        throw new Error("Ban is already inactive");
      }

      await tx.userBan.update({
        where: { id: banId },
        data: { isActive: false },
      });

      if (!ban.threadId) {
        const otherActiveBans = await tx.userBan.count({
          where: {
            userId: ban.userId,
            threadId: null,
            isActive: true,
            id: { not: banId },
          },
        });

        if (otherActiveBans === 0) {
          await tx.user.update({
            where: { id: ban.userId },
            data: { status: "ACTIVE" },
          });
        }
      }

      await tx.notification.create({
        data: {
          userId: ban.userId,
          type: "SYSTEM",
          title: ban.threadId ? "Thread Ban Lifted" : "Account Unbanned",
          message: ban.threadId
            ? "You have been unbanned from a thread and can now participate again."
            : "Your account ban has been lifted. You can now use the platform again.",
          data: {
            banId,
            unbannedBy: session.user.id,
          },
        },
      });

      return ban;
    });

    await logAction({
      action: AuditAction.USER_UNBANNED,
      entityType: "User",
      entityId: result.userId,
      userId: result.userId,
      performedBy: session.user.id,
      details: {
        banId,
        wasGlobalBan: !result.threadId,
        targetUserEmail: result.user.email,
        targetUserName: result.user.name,
      },
    });

    revalidatePath("/dashboard/admin/moderation");

    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function getBannedUsers(filters?: {
  isActive?: boolean;
  threadId?: string;
  limit?: number;
  offset?: number;
}) {
  const session = await requireSession();
  await assertAdmin(session.user);

  const validation = filters
    ? validate(getBannedUsersSchema, filters)
    : { success: true as const, data: {} };
  if (!validation.success) {
    return {
      error: "error" in validation ? validation.error : "Validation failed",
    };
  }

  const limit = Math.min(filters?.limit || 50, 100);
  const offset = filters?.offset || 0;

  try {
    const whereClause: any = {};

    if (filters?.isActive !== undefined) {
      whereClause.isActive = filters.isActive;
    }

    if (filters?.threadId) {
      whereClause.threadId = filters.threadId;
    }

    const [bans, totalCount] = await Promise.all([
      prisma.userBan.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              status: true,
            },
          },
          issuer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          thread: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
        skip: offset,
      }),
      prisma.userBan.count({ where: whereClause }),
    ]);

    return {
      success: true,
      bans,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
    };
  } catch (error) {
    return handleError(error);
  }
}

export async function deleteCommunity(communityId: string, reason?: string) {
  const session = await requireSession();
  await assertAdmin(session.user);

  const validation = validate(deleteEntitySchema, {
    entityId: communityId,
    reason,
  });

  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    await applyModerationRateLimit(session.user.id);
  } catch (error) {
    return { error: (error as Error).message };
  }

  try {
    const community = await validateEntityForDeletion("community", communityId);

    // Type guard: ensure it's a community entity
    if (!("title" in community)) {
      return { error: "Invalid entity type" };
    }

    const sectionCount = await prisma.section.count({
      where: { communityId, deletedAt: null },
    });

    await prisma.$transaction(async (tx) => {
      await tx.community.update({
        where: { id: communityId },
        data: { deletedAt: new Date() },
      });

      await tx.section.updateMany({
        where: {
          communityId,
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      });
    });

    await logAction({
      action: AuditAction.SECTION_DELETED, // Using SECTION_DELETED as closest match
      entityType: "Community",
      entityId: communityId,
      performedBy: session.user.id,
      details: {
        reason,
        communityTitle: community.title,
        communitySlug: community.slug,
        affectedSections: sectionCount,
      },
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/admin/moderation");

    return {
      success: true,
      affectedSections: sectionCount,
    };
  } catch (error) {
    return handleError(error);
  }
}

export async function deleteThread(threadId: string, reason?: string) {
  const session = await requireSession();
  await assertAdmin(session.user);

  const validation = validate(deleteEntitySchema, {
    entityId: threadId,
    reason,
  });

  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    await applyModerationRateLimit(session.user.id);
  } catch (error) {
    return { error: (error as Error).message };
  }

  try {
    const thread = await validateEntityForDeletion("section", threadId);

    // Type guard: ensure it's a section entity
    if (!("name" in thread && "slug" in thread)) {
      return { error: "Invalid entity type" };
    }

    const members = await prisma.sectionMember.findMany({
      where: {
        sectionId: threadId,
        status: "ACTIVE",
      },
      select: { userId: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.section.update({
        where: { id: threadId },
        data: { deletedAt: new Date() },
      });

      if (members.length > 0) {
        await tx.notification.createMany({
          data: members.map((member) => ({
            userId: member.userId,
            type: "SYSTEM" as const,
            title: "Thread Deleted",
            message: reason
              ? `The thread "${thread.name}" has been deleted. Reason: ${reason}`
              : `The thread "${thread.name}" has been deleted by a moderator.`,
            data: {
              threadId,
              threadName: thread.name,
              reason,
            },
          })),
        });
      }
    });

    await logAction({
      action: AuditAction.SECTION_DELETED,
      entityType: "Section",
      entityId: threadId,
      performedBy: session.user.id,
      details: {
        reason,
        threadName: thread.name,
        threadSlug: thread.slug,
        messageCount: thread.messageCount,
        memberCount: thread.memberCount,
        notifiedMembers: members.length,
      },
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/threads");
    revalidatePath("/dashboard/admin/moderation");

    return {
      success: true,
      notifiedMembers: members.length,
    };
  } catch (error) {
    return handleError(error);
  }
}

export async function getMessageDetails(messageId: string) {
  const session = await requireSession();
  await assertAdmin(session.user);

  const validation = validate(getMessageDetailsSchema, { messageId });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
            status: true,
            createdAt: true,
          },
        },
        attachments: true,
        section: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        parent: {
          select: {
            id: true,
            content: true,
            sender: {
              select: {
                name: true,
              },
            },
          },
        },
        reactions: {
          include: {
            user: {
              select: {
                name: true,
                image: true,
              },
            },
          },
        },
        reports: {
          where: {
            status: { in: ["PENDING", "REVIEWING"] },
          },
          include: {
            reporter: {
              select: {
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        editHistory: {
          orderBy: {
            editedAt: "desc",
          },
          take: 5,
        },
      },
    });

    if (!message) {
      return { error: "Message not found" };
    }

    const recentMessages = await prisma.message.count({
      where: {
        senderId: message.senderId,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
        deletedAt: null,
      },
    });

    const senderBans = await prisma.userBan.findMany({
      where: {
        userId: message.senderId,
        isActive: true,
      },
      select: {
        reason: true,
        threadId: true,
        expiresAt: true,
      },
    });

    return {
      success: true,
      data: {
        message,
        context: {
          recentMessages24h: recentMessages,
          activeBans: senderBans,
        },
      },
    };
  } catch (error) {
    return handleError(error);
  }
}

export async function getModerationQueue(filters?: {
  status?: "PENDING" | "REVIEWING";
  limit?: number;
  offset?: number;
}) {
  const session = await requireSession();
  await assertAdmin(session.user);

  const validation = filters
    ? validate(getModerationQueueSchema, filters)
    : { success: true as const, data: {} };
  if (!validation.success) {
    return {
      error: "error" in validation ? validation.error : "Validation failed",
    };
  }

  const limit = Math.min(filters?.limit || 20, 100);
  const offset = filters?.offset || 0;

  try {
    const whereClause: any = {
      status: filters?.status || { in: ["PENDING", "REVIEWING"] },
    };

    const [reports, totalCount] = await Promise.all([
      prisma.report.findMany({
        where: whereClause,
        include: {
          message: {
            select: {
              id: true,
              content: true,
              createdAt: true,
              sender: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true,
                },
              },
              section: {
                select: {
                  name: true,
                  slug: true,
                },
              },
            },
          },
          reporter: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
        skip: offset,
      }),
      prisma.report.count({ where: whereClause }),
    ]);

    return {
      success: true,
      data: {
        reports,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount,
        },
      },
    };
  } catch (error) {
    return handleError(error);
  }
}

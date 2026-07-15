'use server';

import { z } from 'zod';
import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { revalidatePath } from 'next/cache';
import { createNotification } from '@/modules/notifications';
import {
  applyModerationRateLimit,
  requireModerationSession,
  validateEntityForDeletion,
  validateModerationTarget,
} from './policy';
import { executeMessageDeletionEffects, executeModerationAuditAndRevalidate } from './executors';
import {
  banUserSchema,
  deleteMessageSchema,
  deleteEntitySchema,
  getBannedUsersSchema,
  getMessageDetailsSchema,
  getModerationQueueSchema,
} from './schemas';
import { createServerAction } from '@/lib/utils/server-action';
import type { Prisma } from '@prisma/client';

const bulkDeleteSchema = z.object({
  messageIds: z.array(z.string().cuid()).min(1).max(100),
  reason: z.string().max(500).optional(),
});

const unbanSchema = z.object({
  banId: z.string().cuid(),
});

const deleteThreadSchema = z.object({
  threadId: z.string().cuid(),
  reason: z.string().max(500).optional(),
});

export const deleteMessageAction = createServerAction(
  { schema: deleteMessageSchema, actionName: 'deleteMessageAction' },
  async ({ messageId, threadSlug, reason }) => {
    const session = await requireModerationSession();

    await applyModerationRateLimit(session.user.id);

    const message = await validateEntityForDeletion('message', messageId) as {
      id: string;
      threadId: string;
      senderId: string;
      thread: { name: string; slug: string };
    };

    await prisma.$transaction(async (tx) => {
      await tx.message.update({
        where: { id: messageId },
        data: { deletedAt: new Date() },
      });

      await tx.thread.update({
        where: { id: message.threadId },
        data: { messageCount: { decrement: 1 } },
      });

      await tx.notification.create({
        data: {
          userId: message.senderId,
          type: 'SYSTEM',
          title: 'Message Deleted',
          message: reason
            ? `Your message was deleted by a moderator. Reason: ${reason}`
            : 'Your message was deleted by a moderator.',
          data: { messageId, threadSlug, deletedBy: session.user.id },
        },
      });
    });

    await executeMessageDeletionEffects({
      messageId,
      threadId: message.threadId,
      threadSlug,
      moderatorId: session.user.id,
      reason,
      originalAuthor: message.senderId,
    });

    return { data: null, error: null };
  }
);

export const bulkDeleteMessages = createServerAction(
  { schema: bulkDeleteSchema, actionName: 'bulkDeleteMessages' },
  async ({ messageIds, reason }) => {
    const session = await requireModerationSession();
    await applyModerationRateLimit(session.user.id);

    const result = await prisma.$transaction(async (tx) => {
      const messages = await tx.message.findMany({
        where: { id: { in: messageIds } },
        select: { id: true, threadId: true, senderId: true },
      });

      if (messages.length === 0) {
        throw new Error('No valid messages found to delete');
      }

      await tx.message.updateMany({
        where: { id: { in: messages.map((m) => m.id) } },
        data: { deletedAt: new Date() },
      });

      const sectionCounts = messages.reduce((acc, msg) => {
        acc[msg.threadId] = (acc[msg.threadId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Batch thread count updates using Promise.all instead of sequential loop
      await Promise.all(
        Object.entries(sectionCounts).map(([threadId, count]) =>
          tx.thread.update({
            where: { id: threadId },
            data: { messageCount: { decrement: count } },
          })
        )
      );

      // Batch notification creation using createMany
      const uniqueSenders = [...new Set(messages.map((m) => m.senderId).filter((id): id is string => id !== null))];
      const senderMessageCounts = new Map<string, number>();
      for (const senderId of uniqueSenders) {
        senderMessageCounts.set(
          senderId,
          messages.filter((m) => m.senderId === senderId).length
        );
      }

      await tx.notification.createMany({
        data: uniqueSenders.map((senderId) => ({
          userId: senderId,
          type: 'SYSTEM' as const,
          title: 'Messages Deleted',
          message: reason
            ? `${senderMessageCounts.get(senderId)} of your messages were deleted by a moderator. Reason: ${reason}`
            : `${senderMessageCounts.get(senderId)} of your messages were deleted by a moderator.`,
        })),
      });

      return { deletedCount: messages.length };
    });

    await executeModerationAuditAndRevalidate({
      action: 'MESSAGE_DELETED',
      entityType: 'Message',
      entityId: 'bulk',
      userId: session.user.id,
      details: { messageIds, reason, count: result.deletedCount, bulk: true },
      paths: ['/dashboard/admin/moderation'],
    });

    return { data: { deletedCount: result.deletedCount }, error: null };
  }
);

export const banUser = createServerAction(
  {
    schema: banUserSchema,
    actionName: 'banUser',
  },
  async ({ userId, reason, customReason, threadId, expiresAt }) => {
    const session = await requireModerationSession();
    await applyModerationRateLimit(session.user.id);

    const targetUser = await validateModerationTarget(
      userId,
      session.user.id,
      session.user.role || 'ADMIN'
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
        data: null,
        error: threadId ? 'User is already banned from this thread' : 'User is already globally banned',
      };
    }

    const thread = threadId
      ? await prisma.thread.findFirst({
          where: { id: threadId, deletedAt: null },
          select: { id: true, name: true },
        })
      : null;

    if (threadId && !thread) {
      return { data: null, error: 'Thread not found' };
    }

    const ban = await prisma.$transaction(async (tx) => {
      const newBan = await tx.userBan.create({
        data: {
          userId,
          bannedBy: session.user.id,
          reason,
          threadId,
          expiresAt,
          isActive: true,
        },
        include: {
          thread: { select: { name: true, slug: true } },
        },
      });

      if (!threadId) {
        await tx.user.update({
          where: { id: userId },
          data: { status: 'BANNED' },
        });
      }

      const banMessage = threadId
        ? `You have been banned from "${thread?.name}". Reason: ${reason}`
        : `Your account has been banned. Reason: ${reason}`;

      await tx.notification.create({
        data: {
          userId,
          type: 'SYSTEM',
          title: threadId ? 'Thread Ban' : 'Account Banned',
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

    await executeModerationAuditAndRevalidate({
      action: 'USER_BANNED',
      entityType: 'User',
      entityId: userId,
      userId: session.user.id,
      details: {
        reason,
        threadId,
        expiresAt: expiresAt?.toISOString(),
        targetUserEmail: targetUser.email,
        targetUserName: targetUser.name,
      },
      paths: ['/dashboard/admin/moderation', '/dashboard'],
    });

    return { data: { banId: ban.id, expiresAt: ban.expiresAt }, error: null };
  }
);

export const unbanUser = createServerAction(
  { schema: unbanSchema, actionName: 'unbanUser' },
  async ({ banId }) => {
    const session = await requireModerationSession();
    await applyModerationRateLimit(session.user.id);

    const result = await prisma.$transaction(async (tx) => {
      const ban = await tx.userBan.findUnique({
        where: { id: banId },
        select: { userId: true, threadId: true, isActive: true, user: { select: { name: true, email: true } } },
      });

      if (!ban) {
        throw new Error('Ban not found');
      }

      if (!ban.userId) {
        throw new Error('Ban has no associated user');
      }

      if (!ban.isActive) {
        throw new Error('Ban is already inactive');
      }

      await tx.userBan.update({
        where: { id: banId },
        data: { isActive: false },
      });

      if (!ban.threadId) {
        const otherActiveBans = await tx.userBan.count({
          where: { userId: ban.userId, threadId: null, isActive: true, id: { not: banId } },
        });

        if (otherActiveBans === 0) {
          await tx.user.update({
            where: { id: ban.userId },
            data: { status: 'ACTIVE' },
          });
        }
      }

      await tx.notification.create({
        data: {
          userId: ban.userId,
          type: 'SYSTEM',
          title: ban.threadId ? 'Thread Ban Lifted' : 'Account Unbanned',
          message: ban.threadId
            ? 'You have been unbanned from a thread and can now participate again.'
            : 'Your account ban has been lifted. You can now use the platform again.',
          data: { banId, unbannedBy: session.user.id },
        },
      });

      return ban;
    });

    await executeModerationAuditAndRevalidate({
      action: 'USER_UNBANNED',
      entityType: 'User',
      entityId: result.userId!,
      userId: session.user.id,
      details: {
        banId,
        wasGlobalBan: !result.threadId,
        targetUserEmail: result.user?.email ?? 'unknown',
        targetUserName: result.user?.name ?? 'unknown',
      },
      paths: ['/dashboard/admin/moderation'],
    });

    return { data: null, error: null };
  }
);

export const getBannedUsers = createServerAction(
  { schema: getBannedUsersSchema, actionName: 'getBannedUsers' },
  async (filters) => {
    const session = await requireModerationSession();

    const limit = Math.min(filters.limit || 50, 100);
    const offset = filters.offset || 0;

    const whereClause: Prisma.UserBanWhereInput = {};
    if (filters.isActive !== undefined) whereClause.isActive = filters.isActive;
    if (filters.threadId) whereClause.threadId = filters.threadId;

    const [bans, totalCount] = await Promise.all([
      prisma.userBan.findMany({
        where: whereClause,
        include: {
          user: { select: { id: true, name: true, email: true, image: true, status: true } },
          issuer: { select: { id: true, name: true, email: true } },
          thread: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.userBan.count({ where: whereClause }),
    ]);

    return {
      data: {
        bans,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount,
        },
      },
      error: null,
    };
  }
);

export const deleteThread = createServerAction(
  { schema: deleteThreadSchema, actionName: 'deleteThread' },
  async ({ threadId, reason }) => {
    const session = await requireModerationSession();
    await applyModerationRateLimit(session.user.id);

    const thread = await validateEntityForDeletion('section', threadId) as {
      id: string;
      name: string;
      slug: string;
      messageCount: number;
      createdBy: string | null;
    };

    // Soft-delete: set deletedAt instead of hard-deleting.
    await prisma.$transaction(async (tx) => {
      await tx.thread.update({
        where: { id: threadId },
        data: { deletedAt: new Date() },
      });

      if (thread.createdBy) {
        await tx.notification.create({
          data: {
            userId: thread.createdBy,
            type: 'SYSTEM',
            title: 'Thread Deleted',
            message: reason
              ? `Your thread "${thread.name}" has been deleted. Reason: ${reason}`
              : `Your thread "${thread.name}" has been deleted by a moderator.`,
            data: { threadId, threadName: thread.name, reason },
          },
        });
      }
    });

    await executeModerationAuditAndRevalidate({
      action: 'SECTION_DELETED',
      entityType: 'Section',
      entityId: threadId,
      userId: session.user.id,
      details: {
        reason,
        threadName: thread.name,
        threadSlug: thread.slug,
        messageCount: thread.messageCount,
        softDelete: true,
      },
      paths: ['/dashboard', '/dashboard/threads', '/dashboard/admin/moderation'],
    });

    return { data: null, error: null };
  }
);

export const getMessageDetails = createServerAction(
  { schema: getMessageDetailsSchema, actionName: 'getMessageDetails' },
  async ({ messageId }) => {
    const session = await requireModerationSession();

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: { select: { id: true, name: true, email: true, image: true, role: true, status: true, createdAt: true } },
        attachments: true,
        thread: { select: { id: true, name: true, slug: true } },
        parent: { select: { id: true, content: true, sender: { select: { name: true } } } },
        reactions: { include: { user: { select: { name: true, image: true } } } },
        reports: {
          where: { status: { in: ['PENDING'] } },
          include: { reporter: { select: { name: true, email: true } } },
          orderBy: { createdAt: 'desc' },
        },
        editHistory: { orderBy: { editedAt: 'desc' }, take: 5 },
      },
    });

    if (!message) {
      return { data: null, error: 'Message not found' };
    }

    const recentMessages = await prisma.message.count({
      where: { senderId: message.senderId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });

    const senderBans = await prisma.userBan.findMany({
      where: { userId: message.senderId, isActive: true },
      select: { reason: true, threadId: true, expiresAt: true },
    });

    return {
      data: { message, context: { recentMessages24h: recentMessages, activeBans: senderBans } },
      error: null,
    };
  }
);

export const getModerationQueue = createServerAction(
  { schema: getModerationQueueSchema, actionName: 'getModerationQueue' },
  async (filters) => {
    const session = await requireModerationSession();

    const limit = Math.min(filters.limit || 20, 100);
    const offset = filters.offset || 0;

    const whereClause: Prisma.ReportWhereInput = {
      status: filters.status || { in: ['PENDING'] as const },
    };

    const [reports, totalCount] = await Promise.all([
      prisma.report.findMany({
        where: whereClause,
        include: {
          message: {
            select: { id: true, content: true, createdAt: true, sender: { select: { id: true, name: true, email: true, image: true } }, thread: { select: { name: true, slug: true } } },
          },
          reporter: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.report.count({ where: whereClause }),
    ]);

    return {
      data: {
        reports,
        pagination: { total: totalCount, limit, offset, hasMore: offset + limit < totalCount },
      },
      error: null,
    };
  }
);

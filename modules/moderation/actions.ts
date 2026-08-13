'use server';

import { z } from 'zod';
import { prisma } from '@/lib/infrastructure/prisma';
import {
  applyModerationRateLimit,
  findMessageForDeletion,
  findThreadForDeletion,
  validateModerationTarget,
} from './policy';
import { requireModerationRole } from '@/modules/policy';
import { executeAuditAndRevalidate } from './executors';
import {
  banUserSchema,
  deleteMessageSchema,
  getBannedUsersSchema,
  getMessageDetailsSchema,
  getModerationQueueSchema,
} from './schemas';
import { createServerAction } from '@/lib/utils/server-action';
import { actionFailure, actionSuccess } from '@/lib/actions/result';
import { ROUTES } from '@/lib/config/routes';
import { computeHasMore } from '@/lib/db/pagination';
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
    const session = await requireModerationRole();
    await applyModerationRateLimit(session.user.id);

    const message = await findMessageForDeletion(messageId);

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
          userId: message.senderId!,
          type: 'SYSTEM',
          title: 'Message Deleted',
          message: reason
            ? `Your message was deleted by a moderator. Reason: ${reason}`
            : 'Your message was deleted by a moderator.',
          data: { messageId, threadSlug, deletedBy: session.user.id },
        },
      });
    });

    await executeAuditAndRevalidate({
      action: 'MESSAGE_DELETED',
      entityType: 'Message',
      entityId: messageId,
      userId: session.user.id,
      details: { reason, threadSlug, originalAuthor: message.senderId },
      paths: [ROUTES.THREAD(threadSlug), ROUTES.ADMIN_MODERATION],
    });

    return actionSuccess(null);
  }
);

export const bulkDeleteMessages = createServerAction(
  { schema: bulkDeleteSchema, actionName: 'bulkDeleteMessages' },
  async ({ messageIds, reason }) => {
    const session = await requireModerationRole();
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

      const perThread = new Map<string, number>();
      const perSender = new Map<string, number>();
      for (const msg of messages) {
        perThread.set(msg.threadId, (perThread.get(msg.threadId) ?? 0) + 1);
        if (msg.senderId) {
          perSender.set(msg.senderId, (perSender.get(msg.senderId) ?? 0) + 1);
        }
      }

      await Promise.all(
        [...perThread].map(([threadId, count]) =>
          tx.thread.update({
            where: { id: threadId },
            data: { messageCount: { decrement: count } },
          })
        )
      );

      // One rolled-up notification per author rather than one per message.
      await tx.notification.createMany({
        data: [...perSender].map(([senderId, count]) => ({
          userId: senderId,
          type: 'SYSTEM' as const,
          title: 'Messages Deleted',
          message: reason
            ? `${count} of your messages were deleted by a moderator. Reason: ${reason}`
            : `${count} of your messages were deleted by a moderator.`,
        })),
      });

      return { deletedCount: messages.length };
    });

    await executeAuditAndRevalidate({
      action: 'MESSAGE_DELETED',
      entityType: 'Message',
      entityId: 'bulk',
      userId: session.user.id,
      details: { messageIds, reason, count: result.deletedCount, bulk: true },
      paths: [ROUTES.ADMIN_MODERATION],
    });

    return actionSuccess({ deletedCount: result.deletedCount });
  }
);

export const banUser = createServerAction(
  { schema: banUserSchema, actionName: 'banUser' },
  async ({ userId, reason, customReason, threadId, expiresAt }) => {
    const session = await requireModerationRole();
    await applyModerationRateLimit(session.user.id);

    const targetUser = await validateModerationTarget(userId, session.user.id);

    const existingBan = await prisma.userBan.findFirst({
      where: {
        userId,
        isActive: true,
        threadId: threadId || null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });

    if (existingBan) {
      return actionFailure(
        'CONFLICT',
        threadId ? 'User is already banned from this thread' : 'User is already globally banned'
      );
    }

    const thread = threadId
      ? await prisma.thread.findFirst({
          where: { id: threadId, deletedAt: null },
          select: { id: true, name: true },
        })
      : null;

    if (threadId && !thread) {
      return actionFailure('NOT_FOUND', 'Thread not found');
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

      // A thread-scoped ban leaves the account usable elsewhere.
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

    await executeAuditAndRevalidate({
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
      paths: [ROUTES.ADMIN_MODERATION, ROUTES.DASHBOARD],
    });

    return actionSuccess({ banId: ban.id, expiresAt: ban.expiresAt });
  }
);

export const unbanUser = createServerAction(
  { schema: unbanSchema, actionName: 'unbanUser' },
  async ({ banId }) => {
    const session = await requireModerationRole();
    await applyModerationRateLimit(session.user.id);

    const result = await prisma.$transaction(async (tx) => {
      const ban = await tx.userBan.findUnique({
        where: { id: banId },
        select: {
          userId: true,
          threadId: true,
          isActive: true,
          user: { select: { name: true, email: true } },
        },
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

      // Only restore the account once no other global ban is still holding it down.
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

    await executeAuditAndRevalidate({
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
      paths: [ROUTES.ADMIN_MODERATION],
    });

    return actionSuccess(null);
  }
);

export const getBannedUsers = createServerAction(
  { schema: getBannedUsersSchema, actionName: 'getBannedUsers' },
  async (filters) => {
    await requireModerationRole();

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

    return actionSuccess({
      bans,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: computeHasMore(offset, limit, totalCount),
      },
    });
  }
);

export const deleteThread = createServerAction(
  { schema: deleteThreadSchema, actionName: 'deleteThread' },
  async ({ threadId, reason }) => {
    const session = await requireModerationRole();
    await applyModerationRateLimit(session.user.id);

    const thread = await findThreadForDeletion(threadId);

    // Soft-delete: set deletedAt instead of hard-deleting.
    await prisma.thread.update({
      where: { id: threadId },
      data: { deletedAt: new Date() },
    });

    await executeAuditAndRevalidate({
      action: 'THREAD_DELETED',
      entityType: 'Thread',
      entityId: threadId,
      userId: session.user.id,
      details: {
        reason,
        threadName: thread.name,
        threadSlug: thread.slug,
        messageCount: thread.messageCount,
        softDelete: true,
      },
      paths: [ROUTES.DASHBOARD, ROUTES.DASHBOARD_THREADS, ROUTES.ADMIN_MODERATION],
    });

    return actionSuccess(null);
  }
);

export const getMessageDetails = createServerAction(
  { schema: getMessageDetailsSchema, actionName: 'getMessageDetails' },
  async ({ messageId }) => {
    await requireModerationRole();

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
      return actionFailure('NOT_FOUND', 'Message not found');
    }

    // Burst rate over the last day is the signal moderators use to spot spam runs.
    const [recentMessages, senderBans] = await Promise.all([
      prisma.message.count({
        where: {
          senderId: message.senderId,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.userBan.findMany({
        where: { userId: message.senderId, isActive: true },
        select: { reason: true, threadId: true, expiresAt: true },
      }),
    ]);

    return actionSuccess({
      message,
      context: { recentMessages24h: recentMessages, activeBans: senderBans },
    });
  }
);

export const getModerationQueue = createServerAction(
  { schema: getModerationQueueSchema, actionName: 'getModerationQueue' },
  async (filters) => {
    await requireModerationRole();

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
            select: {
              id: true,
              content: true,
              createdAt: true,
              sender: { select: { id: true, name: true, email: true, image: true } },
              thread: { select: { name: true, slug: true } },
            },
          },
          reporter: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.report.count({ where: whereClause }),
    ]);

    return actionSuccess({
      reports,
      pagination: { total: totalCount, limit, offset, hasMore: computeHasMore(offset, limit, totalCount) },
    });
  }
);

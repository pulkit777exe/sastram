'use server';

import { z } from 'zod';
import { prisma } from '@/lib/infrastructure/prisma';
import {
  applyModerationRateLimit,
  buildBannedUsersWhereClause,
  findMessageForDeletion,
  findThreadForDeletion,
  validateModerationTarget,
} from './policy';
import { requireModerationRole } from '@/modules/policy';
import { executeAuditAndRevalidate } from '@/modules/audit';
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

// ── Shared select constants ────────────────────────────────────────────────
const BANNED_USER_SELECT = { id: true, name: true, email: true, image: true, status: true } as const;
const BAN_ISSUER_SELECT = { id: true, name: true, email: true } as const;
const BAN_THREAD_SELECT = { id: true, name: true, slug: true } as const;
const BAN_FOR_UNBAN_SELECT = {
  userId: true,
  threadId: true,
  isActive: true,
  user: { select: { name: true, email: true } },
} as const;

const MESSAGE_SENDER_MOD_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
  role: true,
  status: true,
  createdAt: true,
} as const;



const BANNED_USERS_INCLUDE = {
  user: { select: BANNED_USER_SELECT },
  issuer: { select: BAN_ISSUER_SELECT },
  thread: { select: BAN_THREAD_SELECT },
} as const;

const QUEUE_REPORTER_SELECT = { id: true, name: true, email: true } as const;

// ── Schemas ────────────────────────────────────────────────────────────────
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

// ── Helpers ────────────────────────────────────────────────────────────────
async function requireModerationWithRateLimit() {
  const session = await requireModerationRole();
  await applyModerationRateLimit(session.user.id);
  return session;
}

function getDeleteMessageText(reason?: string): string {
  if (reason) {
    return `Your message was deleted by a moderator. Reason: ${reason}`;
  }
  return 'Your message was deleted by a moderator.';
}

function getBulkDeleteMessage(count: number, reason?: string): string {
  if (reason) {
    return `${count} of your messages were deleted by a moderator. Reason: ${reason}`;
  }
  return `${count} of your messages were deleted by a moderator.`;
}

function getBanMessage(threadName: string | undefined, reason: string, threadId?: string): string {
  if (threadId) {
    return `You have been banned from "${threadName}". Reason: ${reason}`;
  }
  return `Your account has been banned. Reason: ${reason}`;
}

function getUnbanTitle(threadId: string | null): string {
  if (threadId) {
    return 'Thread Ban Lifted';
  }
  return 'Account Unbanned';
}

function getUnbanMessage(threadId: string | null): string {
  if (threadId) {
    return 'You have been unbanned from a thread and can now participate again.';
  }
  return 'Your account ban has been lifted. You can now use the platform again.';
}

function getBanConflictMessage(threadId?: string): string {
  if (threadId) {
    return 'User is already banned from this thread';
  }
  return 'User is already globally banned';
}

function getBanTitle(threadId?: string): string {
  return threadId ? 'Thread Ban' : 'Account Banned';
}

function getFullBanMessage(threadName: string | undefined, reason: string, threadId: string | undefined, customReason?: string): string {
  const base = getBanMessage(threadName, reason, threadId);
  if (customReason) return `${base}. ${customReason}`;
  return base;
}

// ── Bulk delete helpers ────────────────────────────────────────────────────
async function fetchMessagesForBulk(tx: Prisma.TransactionClient, messageIds: string[]) {
  return tx.message.findMany({
    where: { id: { in: messageIds } },
    select: { id: true, threadId: true, senderId: true },
  });
}

function collectBulkAggregates(messages: Array<{ threadId: string; senderId: string | null }>) {
  const perThread = new Map<string, number>();
  const perSender = new Map<string, number>();
  for (const msg of messages) {
    perThread.set(msg.threadId, (perThread.get(msg.threadId) ?? 0) + 1);
    if (msg.senderId) {
      perSender.set(msg.senderId, (perSender.get(msg.senderId) ?? 0) + 1);
    }
  }
  return { perThread, perSender };
}

async function applyBulkThreadDecrements(tx: Prisma.TransactionClient, perThread: Map<string, number>) {
  const updates: Array<Promise<unknown>> = [];
  for (const [threadId, count] of perThread) {
    updates.push(
      tx.thread.update({ where: { id: threadId }, data: { messageCount: { decrement: count } } })
    );
  }
  await Promise.all(updates);
}

async function createBulkDeleteNotifications(
  tx: Prisma.TransactionClient,
  perSender: Map<string, number>,
  reason?: string
) {
  if (perSender.size === 0) return;
  const data: Array<{ userId: string; type: 'SYSTEM'; title: string; message: string }> = [];
  for (const [senderId, count] of perSender) {
    data.push({
      userId: senderId,
      type: 'SYSTEM' as const,
      title: 'Messages Deleted',
      message: getBulkDeleteMessage(count, reason),
    });
  }
  await tx.notification.createMany({ data });
}

async function executeBulkDeleteTransaction(messageIds: string[], reason?: string) {
  return prisma.$transaction(async (tx) => {
    const messages = await fetchMessagesForBulk(tx, messageIds);
    if (messages.length === 0) {
      throw new Error('No valid messages found to delete');
    }

    const messageIdsToDelete: string[] = [];
    for (const m of messages) {
      messageIdsToDelete.push(m.id);
    }
    await tx.message.updateMany({
      where: { id: { in: messageIdsToDelete } },
      data: { deletedAt: new Date() },
    });

    const { perThread, perSender } = collectBulkAggregates(messages);
    await applyBulkThreadDecrements(tx, perThread);
    await createBulkDeleteNotifications(tx, perSender, reason);

    return { deletedCount: messages.length };
  });
}

// ── Ban helpers ────────────────────────────────────────────────────────────
async function findActiveBan(userId: string, threadId?: string) {
  return prisma.userBan.findFirst({
    where: {
      userId,
      isActive: true,
      threadId: threadId || null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
}

async function fetchThreadForBan(threadId: string) {
  const thread = await prisma.thread.findFirst({
    where: { id: threadId, deletedAt: null },
    select: { id: true, name: true },
  });
  return thread;
}

// ── Unban helpers ──────────────────────────────────────────────────────────
async function fetchBanForUnban(tx: Prisma.TransactionClient, banId: string) {
  const ban = await tx.userBan.findUnique({
    where: { id: banId },
    select: BAN_FOR_UNBAN_SELECT,
  });
  if (!ban) throw new Error('Ban not found');
  if (!ban.userId) throw new Error('Ban has no associated user');
  if (!ban.isActive) throw new Error('Ban is already inactive');
  return ban;
}

async function restoreUserIfNoOtherGlobalBan(tx: Prisma.TransactionClient, userId: string, banId: string) {
  const otherActiveBans = await tx.userBan.count({
    where: { userId, threadId: null, isActive: true, id: { not: banId } },
  });
  if (otherActiveBans === 0) {
    await tx.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
  }
}

// ── Message details helpers ────────────────────────────────────────────────
async function fetchMessageWithDetails(messageId: string) {
  return prisma.message.findUnique({
    where: { id: messageId },
    include: {
      sender: { select: MESSAGE_SENDER_MOD_SELECT },
      attachments: true,
      thread: { select: { id: true, name: true, slug: true } },
      parent: { select: { id: true, content: true, sender: { select: { name: true } } } },
      reactions: { include: { user: { select: { name: true, image: true } } } },
      reports: {
        where: { status: { in: ['PENDING'] } as const },
        include: { reporter: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      },
      editHistory: { orderBy: { editedAt: 'desc' }, take: 5 },
    },
  });
}

async function fetchMessageContext(senderId: string | null) {
  return Promise.all([
    prisma.message.count({
      where: {
        senderId,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.userBan.findMany({
      where: { userId: senderId, isActive: true },
      select: { reason: true, threadId: true, expiresAt: true },
    }),
  ]);
}

export const deleteMessageAction = createServerAction(
  { schema: deleteMessageSchema, actionName: 'deleteMessageAction' },
  async ({ messageId, threadSlug, reason }) => {
    const session = await requireModerationWithRateLimit();

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
          message: getDeleteMessageText(reason),
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
    const session = await requireModerationWithRateLimit();
    const result = await executeBulkDeleteTransaction(messageIds, reason);

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
    const session = await requireModerationWithRateLimit();

    const targetUser = await validateModerationTarget(userId, session.user.id);

    const existingBan = await findActiveBan(userId, threadId);
    if (existingBan) {
      return actionFailure('CONFLICT', getBanConflictMessage(threadId));
    }

    let thread: { id: string; name: string } | null = null;
    if (threadId) {
      thread = await fetchThreadForBan(threadId);
      if (thread === null) {
        return actionFailure('NOT_FOUND', 'Thread not found');
      }
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

      await tx.notification.create({
        data: {
          userId,
          type: 'SYSTEM',
          title: getBanTitle(threadId),
          message: getFullBanMessage(thread?.name, reason, threadId, customReason),
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
    const session = await requireModerationWithRateLimit();

    const result = await prisma.$transaction(async (tx) => {
      const ban = await fetchBanForUnban(tx, banId);

      await tx.userBan.update({
        where: { id: banId },
        data: { isActive: false },
      });

      if (!ban.threadId) {
        await restoreUserIfNoOtherGlobalBan(tx, ban.userId!, banId);
      }

      await tx.notification.create({
        data: {
          userId: ban.userId!,
          type: 'SYSTEM',
          title: getUnbanTitle(ban.threadId),
          message: getUnbanMessage(ban.threadId),
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

    const whereClause = buildBannedUsersWhereClause(filters);

    const [bans, totalCount] = await Promise.all([
      prisma.userBan.findMany({
        where: whereClause,
        include: BANNED_USERS_INCLUDE,
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
    const session = await requireModerationWithRateLimit();

    const thread = await findThreadForDeletion(threadId);

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

    const message = await fetchMessageWithDetails(messageId);

    if (!message) {
      return actionFailure('NOT_FOUND', 'Message not found');
    }

    const [recentMessages, senderBans] = await fetchMessageContext(message.senderId);

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
          reporter: { select: QUEUE_REPORTER_SELECT },
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

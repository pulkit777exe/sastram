'use server';

import { z } from 'zod';
import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { revalidatePath } from 'next/cache';
import { requireSession, assertAdmin } from '@/modules/auth/session';
import { emitMessageDeleted } from '@/modules/ws/publisher';
import { logAction } from '@/modules/audit/repository';
import { rateLimit } from '@/lib/services/rate-limit';
import { createNotification } from '@/modules/notifications/repository';
import {
  banUserSchema,
  deleteMessageSchema,
  deleteEntitySchema,
  getBannedUsersSchema,
  getMessageDetailsSchema,
  getModerationQueueSchema,
} from './schemas';
import { createServerAction } from '@/lib/utils/server-action';

const bulkDeleteSchema = z.object({
  messageIds: z.array(z.string().cuid()).min(1).max(100),
  reason: z.string().max(500).optional(),
});

const unbanSchema = z.object({
  banId: z.string().cuid(),
});

const deleteCommunitySchema = z.object({
  communityId: z.string().cuid(),
  reason: z.string().max(500).optional(),
});

const deleteThreadSchema = z.object({
  threadId: z.string().cuid(),
  reason: z.string().max(500).optional(),
});

async function applyModerationRateLimit(userId: string) {
  try {
    const result = await rateLimit({ key: userId, type: 'api' });
    if (!result.success) {
      throw new Error('Rate limit exceeded. Please slow down.');
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Rate limit exceeded. Please slow down.');
  }
}

async function validateModerationTarget(
  targetUserId: string,
  moderatorId: string,
  moderatorRole: string
) {
  if (targetUserId === moderatorId) {
    throw new Error('Cannot perform moderation actions on yourself');
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
    throw new Error('Target user not found');
  }

  if (targetUser.role === 'ADMIN' && moderatorRole !== 'SUPER_ADMIN') {
    throw new Error('Cannot moderate administrator accounts');
  }

  return targetUser;
}

async function validateEntityForDeletion(
  entityType: 'message' | 'section' | 'community',
  entityId: string
) {
  let entity;

  switch (entityType) {
    case 'message':
      entity = await prisma.message.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          sectionId: true,
          senderId: true,
          section: {
            select: { name: true, slug: true },
          },
        },
      });
      break;
    case 'section':
      entity = await prisma.section.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          name: true,
          slug: true,
          messageCount: true,
          memberCount: true,
        },
      });
      break;
    case 'community':
      entity = await prisma.community.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          title: true,
          slug: true,
        },
      });
      break;
  }

  if (!entity) {
    throw new Error(`${entityType} not found`);
  }

  return entity;
}

export const deleteMessageAction = createServerAction(
  { schema: deleteMessageSchema, actionName: 'deleteMessageAction', requireAuth: true },
  async ({ messageId, sectionSlug, reason }) => {
    const session = await requireSession();
    await assertAdmin(session.user);

    await applyModerationRateLimit(session.user.id);

    const message = await validateEntityForDeletion('message', messageId) as {
      id: string;
      sectionId: string;
      senderId: string;
      section: { name: string; slug: string };
    };

    await prisma.$transaction(async (tx) => {
      await tx.message.update({
        where: { id: messageId },
        data: { deletedAt: new Date() },
      });

      await tx.section.update({
        where: { id: message.sectionId },
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
          data: { messageId, sectionSlug, deletedBy: session.user.id },
        },
      });
    });

    await logAction({
      action: 'MESSAGE_DELETED',
      entityType: 'Message',
      entityId: messageId,
      userId: session.user.id,
      details: { reason, sectionSlug, originalAuthor: message.senderId },
    });

    emitMessageDeleted(message.sectionId, messageId);

    revalidatePath(`/dashboard/threads/thread/${sectionSlug}`);
    revalidatePath('/dashboard/admin/moderation');

    return { data: null, error: null };
  }
);

export const bulkDeleteMessages = createServerAction(
  { schema: bulkDeleteSchema, actionName: 'bulkDeleteMessages', requireAuth: true },
  async ({ messageIds, reason }) => {
    const session = await requireSession();
    await assertAdmin(session.user);
    await applyModerationRateLimit(session.user.id);

    const result = await prisma.$transaction(async (tx) => {
      const messages = await tx.message.findMany({
        where: { id: { in: messageIds } },
        select: { id: true, sectionId: true, senderId: true },
      });

      if (messages.length === 0) {
        throw new Error('No valid messages found to delete');
      }

      await tx.message.updateMany({
        where: { id: { in: messages.map((m) => m.id) } },
        data: { deletedAt: new Date() },
      });

      const sectionCounts = messages.reduce((acc, msg) => {
        acc[msg.sectionId] = (acc[msg.sectionId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      for (const [sectionId, count] of Object.entries(sectionCounts)) {
        await tx.section.update({
          where: { id: sectionId },
          data: { messageCount: { decrement: count } },
        });
      }

      const uniqueSenders = [...new Set(messages.map((m) => m.senderId))];

      for (const senderId of uniqueSenders) {
        const userMessageCount = messages.filter((m) => m.senderId === senderId).length;

        await tx.notification.create({
          data: {
            userId: senderId,
            type: 'SYSTEM',
            title: 'Messages Deleted',
            message: reason
              ? `${userMessageCount} of your messages were deleted by a moderator. Reason: ${reason}`
              : `${userMessageCount} of your messages were deleted by a moderator.`,
          },
        });
      }

      return { deletedCount: messages.length };
    });

    await logAction({
      action: 'MESSAGE_DELETED',
      entityType: 'Message',
      entityId: 'bulk',
      userId: session.user.id,
      details: { messageIds, reason, count: result.deletedCount, bulk: true },
    });

    revalidatePath('/dashboard/admin/moderation');

    return { data: { deletedCount: result.deletedCount }, error: null };
  }
);

export const banUser = createServerAction(
  {
    schema: banUserSchema,
    actionName: 'banUser',
  },
  async ({ userId, reason, customReason, threadId, expiresAt }) => {
    const session = await requireSession();
    await assertAdmin(session.user);
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
      ? await prisma.section.findUnique({
          where: { id: threadId },
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

    await logAction({
      action: 'USER_BANNED',
      entityType: 'User',
      entityId: userId,
      userId: session.user.id,
      details: { reason, threadId, expiresAt, targetUserEmail: targetUser.email, targetUserName: targetUser.name },
    });

    revalidatePath('/dashboard/admin/moderation');
    revalidatePath('/dashboard');

    return { data: { banId: ban.id, expiresAt: ban.expiresAt }, error: null };
  }
);

export const unbanUser = createServerAction(
  { schema: unbanSchema, actionName: 'unbanUser', requireAuth: true },
  async ({ banId }) => {
    const session = await requireSession();
    await assertAdmin(session.user);
    await applyModerationRateLimit(session.user.id);

    const result = await prisma.$transaction(async (tx) => {
      const ban = await tx.userBan.findUnique({
        where: { id: banId },
        select: { userId: true, threadId: true, isActive: true, user: { select: { name: true, email: true } } },
      });

      if (!ban) {
        throw new Error('Ban not found');
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

    await logAction({
      action: 'USER_UNBANNED',
      entityType: 'User',
      entityId: result.userId,
      userId: session.user.id,
      details: { banId, wasGlobalBan: !result.threadId, targetUserEmail: result.user.email, targetUserName: result.user.name },
    });

    revalidatePath('/dashboard/admin/moderation');

    return { data: null, error: null };
  }
);

export const getBannedUsers = createServerAction(
  { schema: getBannedUsersSchema, actionName: 'getBannedUsers', requireAuth: true },
  async (filters) => {
    const session = await requireSession();
    await assertAdmin(session.user);

    const limit = Math.min(filters.limit || 50, 100);
    const offset = filters.offset || 0;

    const whereClause: any = {};
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

export const deleteCommunity = createServerAction(
  { schema: deleteCommunitySchema, actionName: 'deleteCommunity' },
  async ({ communityId, reason }) => {
    const session = await requireSession();
    await assertAdmin(session.user);
    await applyModerationRateLimit(session.user.id);

    const community = await validateEntityForDeletion('community', communityId) as {
      id: string;
      title: string;
      slug: string;
    };

    const sectionCount = await prisma.section.count({
      where: { communityId },
    });

    await prisma.community.delete({ where: { id: communityId } });

    await logAction({
      action: 'SECTION_DELETED',
      entityType: 'Community',
      entityId: communityId,
      userId: session.user.id,
      details: { reason, communityTitle: community.title, communitySlug: community.slug, affectedSections: sectionCount },
    });

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/admin/moderation');

    return { data: { affectedSections: sectionCount }, error: null };
  }
);

export const deleteThread = createServerAction(
  { schema: deleteThreadSchema, actionName: 'deleteThread' },
  async ({ threadId, reason }) => {
    const session = await requireSession();
    await assertAdmin(session.user);
    await applyModerationRateLimit(session.user.id);

    const thread = await validateEntityForDeletion('section', threadId) as {
      id: string;
      name: string;
      slug: string;
      messageCount: number;
      memberCount: number;
    };

    const members = await prisma.sectionMember.findMany({
      where: { sectionId: threadId, status: 'ACTIVE' },
      select: { userId: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.section.delete({ where: { id: threadId } });

      if (members.length > 0) {
        await tx.notification.createMany({
          data: members.map((member) => ({
            userId: member.userId,
            type: 'SYSTEM',
            title: 'Thread Deleted',
            message: reason
              ? `The thread "${thread.name}" has been deleted. Reason: ${reason}`
              : `The thread "${thread.name}" has been deleted by a moderator.`,
            data: { threadId, threadName: thread.name, reason },
          })),
        });
      }
    });

    await logAction({
      action: 'SECTION_DELETED',
      entityType: 'Section',
      entityId: threadId,
      userId: session.user.id,
      details: { reason, threadName: thread.name, threadSlug: thread.slug, messageCount: thread.messageCount, memberCount: thread.memberCount, notifiedMembers: members.length },
    });

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/threads');
    revalidatePath('/dashboard/admin/moderation');

    return { data: { notifiedMembers: members.length }, error: null };
  }
);

export const getMessageDetails = createServerAction(
  { schema: getMessageDetailsSchema, actionName: 'getMessageDetails', requireAuth: true },
  async ({ messageId }) => {
    const session = await requireSession();
    await assertAdmin(session.user);

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: { select: { id: true, name: true, email: true, image: true, role: true, status: true, createdAt: true } },
        attachments: true,
        section: { select: { id: true, name: true, slug: true } },
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
    const session = await requireSession();
    await assertAdmin(session.user);

    const limit = Math.min(filters.limit || 20, 100);
    const offset = filters.offset || 0;

    const whereClause: any = {
      status: filters.status || { in: ['PENDING', 'REVIEWING'] },
    };

    const [reports, totalCount] = await Promise.all([
      prisma.report.findMany({
        where: whereClause,
        include: {
          message: {
            select: { id: true, content: true, createdAt: true, sender: { select: { id: true, name: true, email: true, image: true } }, section: { select: { name: true, slug: true } } },
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

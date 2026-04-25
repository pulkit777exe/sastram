import { logger } from '@/lib/infrastructure/logger';
'use server';

import { prisma } from '@/lib/infrastructure/prisma';
import { revalidatePath } from 'next/cache';
import { requireSession, assertAdmin } from '@/modules/auth/session';
import { emitMessageDeleted } from '@/modules/ws/publisher';
import { logAction } from '@/modules/audit/repository';
import { rateLimit } from '@/lib/services/rate-limit';
import { createNotification } from '@/modules/notifications/repository';
import { z } from 'zod';

import {
  banUserSchema,
  deleteMessageSchema,
  deleteEntitySchema,
  getBannedUsersSchema,
  getMessageDetailsSchema,
  getModerationQueueSchema,
} from './schemas';

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
            select: {
              name: true,
              slug: true,
            },
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

export async function deleteMessageAction(messageId: string, sectionSlug: string, reason?: string) {
  const validation = deleteMessageSchema.safeParse({
    messageId,
    sectionSlug,
    reason,
  });

  if (!validation.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    await assertAdmin(session.user);

    await applyModerationRateLimit(session.user.id);

    const message = await validateEntityForDeletion('message', messageId);

    // Type guard: ensure it's a message entity
    if (!('sectionId' in message)) {
      return { data: null, error: 'Invalid entity type' };
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
          type: 'SYSTEM',
          title: 'Message Deleted',
          message: reason
            ? `Your message was deleted by a moderator. Reason: ${reason}`
            : 'Your message was deleted by a moderator.',
          data: {
            messageId,
            sectionSlug,
            deletedBy: session.user.id,
          },
        },
      });
    });

    await logAction({
      action: 'MESSAGE_DELETED',
      entityType: 'Message',
      entityId: messageId,
      userId: session.user.id,
      details: {
        reason,
        sectionSlug,
        originalAuthor: message.senderId,
      },
    });

    emitMessageDeleted(message.sectionId, messageId);

    revalidatePath(`/dashboard/threads/thread/${sectionSlug}`);
    revalidatePath('/dashboard/admin/moderation');

    return { data: null, error: null };
  } catch (error) {
    logger.error('[deleteMessageAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function bulkDeleteMessages(messageIds: string[], reason?: string) {
  const parsed = bulkDeleteSchema.safeParse({ messageIds, reason });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    await assertAdmin(session.user);
    await applyModerationRateLimit(session.user.id);

    const result = await prisma.$transaction(async (tx) => {
      const messages = await tx.message.findMany({
        where: {
          id: { in: parsed.data.messageIds },
        },
        select: {
          id: true,
          sectionId: true,
          senderId: true,
        },
      });

      if (messages.length === 0) {
        throw new Error('No valid messages found to delete');
      }

      await tx.message.updateMany({
        where: {
          id: { in: messages.map((m) => m.id) },
        },
        data: {
          deletedAt: new Date(),
        },
      });

      const sectionCounts = messages.reduce(
        (acc, msg) => {
          acc[msg.sectionId] = (acc[msg.sectionId] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

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
      details: {
        messageIds: parsed.data.messageIds,
        reason: parsed.data.reason,
        count: result.deletedCount,
        bulk: true,
      },
    });

    revalidatePath('/dashboard/admin/moderation');

    return {
      data: { deletedCount: result.deletedCount },
      error: null,
    };
  } catch (error) {
    logger.error('[bulkDeleteMessages]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function banUser(
  userId: string,
  reason: string,
  customReason?: string,
  threadId?: string,
  expiresAt?: Date
) {
  const validation = banUserSchema.safeParse({
    userId,
    reason,
    customReason,
    threadId,
    expiresAt,
  });

  if (!validation.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    await assertAdmin(session.user);
    await applyModerationRateLimit(session.user.id);

    const targetUser = await validateModerationTarget(
      validation.data.userId,
      session.user.id,
      session.user.role || 'ADMIN'
    );

    const existingBan = await prisma.userBan.findFirst({
      where: {
        userId: validation.data.userId,
        isActive: true,
        threadId: validation.data.threadId || null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });

    if (existingBan) {
      return {
        data: null,
        error: validation.data.threadId
          ? 'User is already banned from this thread'
          : 'User is already globally banned',
      };
    }

    let thread: { id: string; name: string } | null;
    if (validation.data.threadId) {
      thread = await prisma.section.findUnique({
        where: { id: validation.data.threadId },
        select: { id: true, name: true },
      });

      if (!thread) {
        return { data: null, error: 'Thread not found' };
      }
    }

    const ban = await prisma.$transaction(async (tx) => {
      const newBan = await tx.userBan.create({
        data: {
          userId: validation.data.userId,
          bannedBy: session.user.id,
          reason: validation.data.reason,

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
          where: { id: validation.data.userId },
          data: { status: 'BANNED' },
        });
      }

      const banMessage = validation.data.threadId
        ? `You have been banned from "${thread?.name}". Reason: ${validation.data.reason}`
        : `Your account has been banned. Reason: ${validation.data.reason}`;

      await tx.notification.create({
        data: {
          userId,
          type: 'SYSTEM',
          title: validation.data.threadId ? 'Thread Ban' : 'Account Banned',
          message: validation.data.customReason
            ? `${banMessage}. ${validation.data.customReason}`
            : banMessage,
          data: {
            banId: newBan.id,
            reason: validation.data.reason,
            customReason: validation.data.customReason,
            threadId: validation.data.threadId,
            expiresAt: validation.data.expiresAt?.toISOString(),
            bannedBy: session.user.id,
          },
        },
      });

      return newBan;
    });

    await logAction({
      action: 'USER_BANNED',
      entityType: 'User',
      entityId: validation.data.userId,
      userId: session.user.id,
      details: {
        reason: validation.data.reason,

        threadId: validation.data.threadId,
        expiresAt: validation.data.expiresAt,
        targetUserEmail: targetUser.email,
        targetUserName: targetUser.name,
      },
    });

    revalidatePath('/dashboard/admin/moderation');
    revalidatePath('/dashboard');

    return {
      data: {
        banId: ban.id,
        expiresAt: ban.expiresAt,
      },
      error: null,
    };
  } catch (error) {
    logger.error('[banUser]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function unbanUser(banId: string) {
  const parsed = unbanSchema.safeParse({ banId });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    await assertAdmin(session.user);
    await applyModerationRateLimit(session.user.id);

    const result = await prisma.$transaction(async (tx) => {
      const ban = await tx.userBan.findUnique({
        where: { id: parsed.data.banId },
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
        throw new Error('Ban not found');
      }

      if (!ban.isActive) {
        throw new Error('Ban is already inactive');
      }

      await tx.userBan.update({
        where: { id: parsed.data.banId },
        data: { isActive: false },
      });

      if (!ban.threadId) {
        const otherActiveBans = await tx.userBan.count({
          where: {
            userId: ban.userId,
            threadId: null,
            isActive: true,
            id: { not: parsed.data.banId },
          },
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
          data: {
            banId: parsed.data.banId,
            unbannedBy: session.user.id,
          },
        },
      });

      return ban;
    });

    await logAction({
      action: 'USER_UNBANNED',
      entityType: 'User',
      entityId: result.userId,
      userId: session.user.id,
      details: {
        banId: parsed.data.banId,
        wasGlobalBan: !result.threadId,
        targetUserEmail: result.user.email,
        targetUserName: result.user.name,
      },
    });

    revalidatePath('/dashboard/admin/moderation');

    return { data: null, error: null };
  } catch (error) {
    logger.error('[unbanUser]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function getBannedUsers(filters?: {
  isActive?: boolean;
  threadId?: string;
  limit?: number;
  offset?: number;
}) {
  const validation = getBannedUsersSchema.safeParse(filters ?? {});
  if (!validation.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    await assertAdmin(session.user);

    const limit = Math.min(validation.data.limit || 50, 100);
    const offset = validation.data.offset || 0;

    const whereClause: any = {};

    if (validation.data.isActive !== undefined) {
      whereClause.isActive = validation.data.isActive;
    }

    if (validation.data.threadId) {
      whereClause.threadId = validation.data.threadId;
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
          createdAt: 'desc',
        },
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
  } catch (error) {
    logger.error('[getBannedUsers]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function deleteCommunity(communityId: string, reason?: string) {
  const parsed = deleteCommunitySchema.safeParse({ communityId, reason });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    await assertAdmin(session.user);
    await applyModerationRateLimit(session.user.id);

    const community = await validateEntityForDeletion('community', parsed.data.communityId);

    // Type guard: ensure it's a community entity
    if (!('title' in community)) {
      return { data: null, error: 'Invalid entity type' };
    }

    const sectionCount = await prisma.section.count({
      where: { communityId: parsed.data.communityId },
    });

    await prisma.$transaction(async (tx) => {
      await tx.community.delete({
        where: { id: parsed.data.communityId },
      });
    });

    await logAction({
      action: 'SECTION_DELETED', // Using SECTION_DELETED as closest match
      entityType: 'Community',
      entityId: parsed.data.communityId,
      userId: session.user.id,
      details: {
        reason: parsed.data.reason,
        communityTitle: community.title,
        communitySlug: community.slug,
        affectedSections: sectionCount,
      },
    });

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/admin/moderation');

    return {
      data: { affectedSections: sectionCount },
      error: null,
    };
  } catch (error) {
    logger.error('[deleteCommunity]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function deleteThread(threadId: string, reason?: string) {
  const parsed = deleteThreadSchema.safeParse({ threadId, reason });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    await assertAdmin(session.user);
    await applyModerationRateLimit(session.user.id);

    const thread = await validateEntityForDeletion('section', parsed.data.threadId);

    // Type guard: ensure it's a section entity
    if (!('name' in thread && 'slug' in thread)) {
      return { data: null, error: 'Invalid entity type' };
    }

    const members = await prisma.sectionMember.findMany({
      where: {
        sectionId: parsed.data.threadId,
        status: 'ACTIVE',
      },
      select: { userId: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.section.delete({
        where: { id: parsed.data.threadId },
      });

      if (members.length > 0) {
        await tx.notification.createMany({
          data: members.map((member) => ({
            userId: member.userId,
            type: 'SYSTEM' as const,
            title: 'Thread Deleted',
            message: parsed.data.reason
              ? `The thread "${thread.name}" has been deleted. Reason: ${parsed.data.reason}`
              : `The thread "${thread.name}" has been deleted by a moderator.`,
            data: {
              threadId: parsed.data.threadId,
              threadName: thread.name,
              reason: parsed.data.reason,
            },
          })),
        });
      }
    });

    await logAction({
      action: 'SECTION_DELETED',
      entityType: 'Section',
      entityId: parsed.data.threadId,
      userId: session.user.id,
      details: {
        reason: parsed.data.reason,
        threadName: thread.name,
        threadSlug: thread.slug,
        messageCount: thread.messageCount,
        memberCount: thread.memberCount,
        notifiedMembers: members.length,
      },
    });

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/threads');
    revalidatePath('/dashboard/admin/moderation');

    return {
      data: { notifiedMembers: members.length },
      error: null,
    };
  } catch (error) {
    logger.error('[deleteThread]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function getMessageDetails(messageId: string) {
  const validation = getMessageDetailsSchema.safeParse({ messageId });
  if (!validation.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    await assertAdmin(session.user);

    const message = await prisma.message.findUnique({
      where: { id: validation.data.messageId },
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
            status: { in: ['PENDING'] },
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
            createdAt: 'desc',
          },
        },
        editHistory: {
          orderBy: {
            editedAt: 'desc',
          },
          take: 5,
        },
      },
    });

    if (!message) {
      return { data: null, error: 'Message not found' };
    }

    const recentMessages = await prisma.message.count({
      where: {
        senderId: message.senderId,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
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
      data: {
        message,
        context: {
          recentMessages24h: recentMessages,
          activeBans: senderBans,
        },
      },
      error: null,
    };
  } catch (error) {
    logger.error('[getMessageDetails]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function getModerationQueue(filters?: {
  status?: 'PENDING' | 'REVIEWING';
  limit?: number;
  offset?: number;
}) {
  const validation = getModerationQueueSchema.safeParse(filters ?? {});
  if (!validation.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    await assertAdmin(session.user);

    const limit = Math.min(validation.data.limit || 20, 100);
    const offset = validation.data.offset || 0;

    const whereClause: any = {
      status: validation.data.status || { in: ['PENDING', 'REVIEWING'] },
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
          createdAt: 'desc',
        },
        take: limit,
        skip: offset,
      }),
      prisma.report.count({ where: whereClause }),
    ]);

    return {
      data: {
        reports,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount,
        },
      },
      error: null,
    };
  } catch (error) {
    logger.error('[getModerationQueue]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

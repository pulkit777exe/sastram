import { ThreadRole } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import type { ThreadMember } from '@/modules/threads/types';

export async function getThreadMembers(threadId: string): Promise<ThreadMember[]> {
  try {
    const members = await prisma.threadMember.findMany({
      where: {
        threadId: threadId,
        status: 'ACTIVE',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            status: true,
            lastSeenAt: true,
          },
        },
      },
      orderBy: {
        joinedAt: 'asc',
      },
    });

    return (members ?? []).map((member) => ({
      id: member.id,
      userId: member.userId,
      role: member.role,
      joinedAt: member.joinedAt,
      user: {
        id: member.user.id,
        name: member.user.name,
        avatarUrl: member.user.image,
        status: member.user.status,
        lastSeenAt: member.user.lastSeenAt,
      },
    }));
  } catch (error) {
    logger.error('[getThreadMembers]', error);
    return [];
  }
}

export async function addThreadMember(
  threadId: string,
  userId: string,
  role: ThreadRole = 'MEMBER'
): Promise<void> {
  await prisma.threadMember.upsert({
    where: {
      threadId_userId: {
        threadId: threadId,
        userId,
      },
    },
    update: {
      role,
      status: 'ACTIVE',
    },
    create: {
      threadId: threadId,
      userId,
      role,
      status: 'ACTIVE',
    },
  });
}

export async function updateThreadMemberRole(
  threadId: string,
  userId: string,
  role: ThreadRole
): Promise<void> {
  await prisma.threadMember.update({
    where: {
      threadId_userId: {
        threadId: threadId,
        userId,
      },
    },
    data: {
      role,
    },
  });
}

export async function removeThreadMember(threadId: string, userId: string): Promise<void> {
  await prisma.threadMember.delete({
    where: {
      threadId_userId: {
        threadId: threadId,
        userId,
      },
    },
  });
}

import { prisma } from '@/lib/infrastructure/prisma';
import type { ThreadRole } from '@prisma/client';
import { cache } from 'react';
import { dedupe } from '@/lib/dedupe';
import { logger } from '@/lib/infrastructure/logger';

export async function addMember(threadId: string, userId: string, role: ThreadRole = 'MEMBER') {
  return prisma.threadMember.create({
    data: {
      threadId,
      userId,
      role,
      status: 'ACTIVE',
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });
}

export async function removeMember(threadId: string, userId: string): Promise<{ count: number }> {
  return prisma.threadMember.updateMany({
    where: {
      threadId,
      userId,
      status: 'ACTIVE',
    },
    data: {
      status: 'LEFT',
    },
  });
}

export async function updateMemberRole(threadId: string, userId: string, role: ThreadRole) {
  return prisma.threadMember.updateMany({
    where: {
      threadId,
      userId,
    },
    data: {
      role,
    },
  });
}

export const getThreadMembers = cache(async (threadId: string) => {
  try {
    return (
      (await dedupe(`members:thread:${threadId}`, () =>
        prisma.threadMember.findMany({
          where: {
            threadId,
            status: 'ACTIVE',
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                lastSeenAt: true,
              },
            },
          },
          orderBy: [
            { role: 'asc' }, // OWNER first, then MODERATOR, then MEMBER
            { joinedAt: 'asc' },
          ],
        })
      )) ?? []
    );
  } catch (error) {
    logger.error('[getThreadMembers]', error);
    return [];
  }
});

export const getUserMemberships = cache(async (userId: string) => {
  try {
    return (
      (await dedupe(`members:user:${userId}`, () =>
        prisma.threadMember.findMany({
          where: {
            userId,
            status: 'ACTIVE',
          },
          include: {
            thread: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
          orderBy: {
            joinedAt: 'desc',
          },
        })
      )) ?? []
    );
  } catch (error) {
    logger.error('[getUserMemberships]', error);
    return [];
  }
});

export const getMemberRole = cache(async (threadId: string, userId: string) => {
  const member = await dedupe(`members:role:${threadId}:${userId}`, () =>
    prisma.threadMember.findUnique({
      where: {
        threadId_userId: {
          threadId,
          userId,
        },
      },
      select: {
        role: true,
        status: true,
      },
    })
  );

  return member;
});

export const isMember = cache(async (threadId: string, userId: string) => {
  const member = await getMemberRole(threadId, userId);
  return member?.status === 'ACTIVE';
});

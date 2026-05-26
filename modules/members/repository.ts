import { prisma } from '@/lib/infrastructure/prisma';
import { SectionRole, MemberStatus } from '@prisma/client';
import { cache } from 'react';
import { dedupe } from '@/lib/dedupe';
import { logger } from '@/lib/infrastructure/logger';

export async function addMember(sectionId: string, userId: string, role: SectionRole = 'MEMBER') {
  return prisma.sectionMember.create({
    data: {
      sectionId,
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

export async function removeMember(sectionId: string, userId: string): Promise<{ count: number }> {
  return prisma.sectionMember.updateMany({
    where: {
      sectionId,
      userId,
      status: 'ACTIVE',
    },
    data: {
      status: 'LEFT',
    },
  });
}

export async function updateMemberRole(sectionId: string, userId: string, role: SectionRole) {
  return prisma.sectionMember.updateMany({
    where: {
      sectionId,
      userId,
    },
    data: {
      role,
    },
  });
}

export const getSectionMembers = cache(async (sectionId: string) => {
  try {
    return (
      (await dedupe(`members:section:${sectionId}`, () =>
        prisma.sectionMember.findMany({
          where: {
            sectionId,
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
    logger.error('[getSectionMembers]', error);
    return [];
  }
});

export const getUserMemberships = cache(async (userId: string) => {
  try {
    return (
      (await dedupe(`members:user:${userId}`, () =>
        prisma.sectionMember.findMany({
          where: {
            userId,
            status: 'ACTIVE',
          },
          include: {
            section: {
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

export const getMemberRole = cache(async (sectionId: string, userId: string) => {
  const member = await dedupe(`members:role:${sectionId}:${userId}`, () =>
    prisma.sectionMember.findUnique({
      where: {
        sectionId_userId: {
          sectionId,
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

export const isMember = cache(async (sectionId: string, userId: string) => {
  const member = await getMemberRole(sectionId, userId);
  return member?.status === 'ACTIVE';
});

import { SectionRole } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import type { ThreadMember } from '@/modules/members/types';

export async function getThreadMembers(threadId: string): Promise<ThreadMember[]> {
  try {
    const members = await prisma.sectionMember.findMany({
      where: {
        sectionId: threadId,
        status: 'ACTIVE',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
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
      sectionId: member.sectionId,
      role: member.role,
      status: member.status,
      joinedAt: member.joinedAt,
      user: {
        id: member.user.id,
        name: member.user.name,
        image: member.user.image,
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
  role: SectionRole = 'MEMBER'
): Promise<void> {
  await prisma.sectionMember.upsert({
    where: {
      sectionId_userId: {
        sectionId: threadId,
        userId,
      },
    },
    update: {
      role,
      status: 'ACTIVE',
    },
    create: {
      sectionId: threadId,
      userId,
      role,
      status: 'ACTIVE',
    },
  });
}

export async function updateThreadMemberRole(
  threadId: string,
  userId: string,
  role: SectionRole
): Promise<void> {
  await prisma.sectionMember.update({
    where: {
      sectionId_userId: {
        sectionId: threadId,
        userId,
      },
    },
    data: {
      role,
    },
  });
}

export async function removeThreadMember(threadId: string, userId: string): Promise<void> {
  await prisma.sectionMember.delete({
    where: {
      sectionId_userId: {
        sectionId: threadId,
        userId,
      },
    },
  });
}

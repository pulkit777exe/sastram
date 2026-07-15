import { Role } from '@prisma/client';
import { cache } from 'react';
import { prisma } from '@/lib/infrastructure/prisma';
import { canAccessThread, canManageThread } from '@/lib/thread-access';
import type { ThreadMember } from '@/modules/members/types';

export async function addMember(threadId: string, userId: string, role = 'MEMBER') {
  void threadId;
  void userId;
  void role;
  return null;
}

export async function removeMember(threadId: string, userId: string): Promise<{ count: number }> {
  void threadId;
  void userId;
  return { count: 0 };
}

export async function updateMemberRole(threadId: string, userId: string, role: string) {
  void threadId;
  void userId;
  void role;
  return { count: 0 };
}

export const getThreadMembers = cache(async (threadId: string): Promise<ThreadMember[]> => {
  void threadId;
  return [];
});

export const getUserMemberships = cache(async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      threads: {
        where: { deletedAt: null },
        select: { id: true, name: true, slug: true },
        orderBy: { updatedAt: 'desc' },
      },
    },
  });

  return user?.threads ?? [];
});

export const getMemberRole = cache(async (threadId: string, userId: string) => {
  const [thread, user] = await Promise.all([
    prisma.thread.findFirst({
      where: { id: threadId, deletedAt: null },
      select: { id: true, createdBy: true, visibility: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    }),
  ]);

  if (!thread || !user) {
    return null;
  }

  if (canManageThread({ threadId: thread.id, createdBy: thread.createdBy, visibility: thread.visibility }, userId, user.role)) {
    return { role: user.role === Role.USER ? 'OWNER' : 'MODERATOR', status: 'ACTIVE' } as const;
  }

  const allowed = await canAccessThread(
    { threadId: thread.id, createdBy: thread.createdBy, visibility: thread.visibility },
    userId,
    user.role
  );

  return allowed ? ({ role: 'MEMBER', status: 'ACTIVE' } as const) : null;
});

export const isMember = cache(async (threadId: string, userId: string) => {
  const member = await getMemberRole(threadId, userId);
  return member?.status === 'ACTIVE';
});

export const getSectionMembers = getThreadMembers;

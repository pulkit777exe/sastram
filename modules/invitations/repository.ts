import type { Role } from '@prisma/client';
import { cache } from 'react';
import { prisma } from '@/lib/infrastructure/prisma';
import { canManageThread, canReadThread } from '@/lib/thread-access';

export const INVITATION_TTL_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function findThreadById(threadId: string) {
  return prisma.thread.findFirst({
    where: { id: threadId, deletedAt: null },
    select: { id: true, slug: true, name: true, createdBy: true, visibility: true },
  });
}

export async function findManageableThread(threadId: string, userId: string, role: Role) {
  const thread = await findThreadById(threadId);

  if (!thread) return null;

  const manageable = canManageThread(
    { threadId: thread.id, createdBy: thread.createdBy, visibility: thread.visibility },
    userId,
    role
  );

  return manageable ? thread : null;
}

export async function createInvitation({
  threadId,
  email,
  senderId,
}: {
  threadId: string;
  email: string;
  senderId: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.threadInvitation.deleteMany({
      where: {
        threadId,
        email,
        status: { in: ['DECLINED', 'EXPIRED'] },
      },
    });

    const existing = await tx.threadInvitation.findUnique({
      where: { threadId_email: { threadId, email } },
    });

    if (existing) return null;

    return tx.threadInvitation.create({
      data: {
        threadId,
        senderId,
        email,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * MS_PER_DAY),
      },
      include: {
        thread: { select: { slug: true, name: true } },
        sender: { select: { name: true, email: true } },
      },
    });
  });
}

export async function listThreadInvitations(threadId: string) {
  return prisma.threadInvitation.findMany({
    where: { threadId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, email: true, status: true, createdAt: true },
  });
}

export async function revokeInvitation(invitationId: string) {
  return prisma.threadInvitation.delete({ where: { id: invitationId } });
}

export async function findInvitationById(invitationId: string) {
  return prisma.threadInvitation.findUnique({
    where: { id: invitationId },
    select: { id: true, threadId: true },
  });
}

// There is no membership table — "role" is derived from the ThreadAccessPolicy
// (`canManageThread` for OWNER/MODERATOR, `canReadThread` for MEMBER), the
// viewer's global role, thread authorship, and accepted invitations.
export const getThreadRole = cache(async (threadId: string, userId: string) => {
  const threadPromise = prisma.thread.findFirst({
    where: { id: threadId, deletedAt: null },
    select: { id: true, createdBy: true, visibility: true },
  });
  const userPromise = prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  const [thread, user] = await Promise.all([threadPromise, userPromise]);

  if (!thread || !user) return null;

  const context = { threadId: thread.id, createdBy: thread.createdBy, visibility: thread.visibility };

  if (canManageThread(context, userId, user.role)) {
    return {
      role: thread.createdBy === userId ? 'OWNER' : 'MODERATOR',
      status: 'ACTIVE',
    } as const;
  }

  const allowed = await canReadThread(context, userId, user.role);

  return allowed ? ({ role: 'MEMBER', status: 'ACTIVE' } as const) : null;
});

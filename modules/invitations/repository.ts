import type { Role } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';
import { canManageThread } from '@/lib/thread-access';

export const INVITATION_TTL_DAYS = 7;

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
        expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000),
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

export async function removeMemberInvitations(threadId: string, email: string) {
  return prisma.threadInvitation.deleteMany({ where: { threadId, email } });
}

export async function findInvitationById(invitationId: string) {
  return prisma.threadInvitation.findUnique({
    where: { id: invitationId },
    select: { id: true, threadId: true },
  });
}

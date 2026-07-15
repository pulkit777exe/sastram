/**
 * Thread access control — replaces ThreadMember-based checks.
 *
 * Visibility rule (private/restricted threads):
 *   creator OR accepted ThreadInvitation OR global MODERATOR/ADMIN
 * Public threads are readable by anyone; write still requires session.
 */

import { Role, ThreadVisibility } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';
import { AppError } from '@/lib/utils/errors';
import { redirect } from 'next/navigation';
import { canModerate } from '@/lib/config/permissions';

export interface ThreadAccessContext {
  threadId: string;
  createdBy: string | null;
  visibility: ThreadVisibility;
}

export async function canAccessThread(
  thread: ThreadAccessContext,
  userId?: string | null,
  userRole?: Role | null
): Promise<boolean> {
  if (thread.visibility === 'PUBLIC') {
    return true;
  }

  if (!userId) {
    return false;
  }

  if (canModerate(userRole ?? Role.USER)) {
    return true;
  }

  if (thread.createdBy === userId) {
    return true;
  }

  const invitation = await prisma.threadInvitation.findFirst({
    where: {
      threadId: thread.threadId,
      status: 'ACCEPTED',
      OR: [
        { senderId: userId },
        // Invitee matched by email requires a user lookup — handled in assertThreadAccess
      ],
    },
    select: { id: true },
  });

  if (invitation) {
    return true;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!user) {
    return false;
  }

  const emailInvitation = await prisma.threadInvitation.findFirst({
    where: {
      threadId: thread.threadId,
      email: user.email,
      status: 'ACCEPTED',
    },
    select: { id: true },
  });

  return emailInvitation !== null;
}

export async function canWriteToThread(
  thread: ThreadAccessContext,
  userId: string,
  userRole: Role
): Promise<boolean> {
  if (canModerate(userRole)) {
    return true;
  }

  if (thread.visibility === 'PUBLIC') {
    return true;
  }

  return canAccessThread(thread, userId, userRole);
}

export function canManageThread(
  thread: ThreadAccessContext,
  userId: string,
  userRole: Role
): boolean {
  if (canModerate(userRole)) {
    return true;
  }
  return thread.createdBy === userId;
}

export async function requireThreadAccessOrThrow(
  threadId: string,
  userId: string,
  userRole: Role = Role.USER
): Promise<void> {
  const thread = await prisma.thread.findUnique({
    where: { id: threadId, deletedAt: null },
    select: { id: true, createdBy: true, visibility: true },
  });

  if (!thread) {
    throw new AppError('Thread not found', 'NOT_FOUND', 404);
  }

  const allowed = await canAccessThread(
    { threadId: thread.id, createdBy: thread.createdBy, visibility: thread.visibility },
    userId,
    userRole
  );

  if (!allowed) {
    throw new AppError('Forbidden: no access to this thread', 'FORBIDDEN', 403);
  }
}

export async function requireThreadWriteOrThrow(
  threadId: string,
  userId: string,
  userRole: Role = Role.USER
): Promise<void> {
  const thread = await prisma.thread.findUnique({
    where: { id: threadId, deletedAt: null },
    select: { id: true, createdBy: true, visibility: true },
  });

  if (!thread) {
    throw new AppError('Thread not found', 'NOT_FOUND', 404);
  }

  const allowed = await canWriteToThread(
    { threadId: thread.id, createdBy: thread.createdBy, visibility: thread.visibility },
    userId,
    userRole
  );

  if (!allowed) {
    throw new AppError('Forbidden: cannot write to this thread', 'FORBIDDEN', 403);
  }
}

export async function requireThreadAccess(
  threadId: string,
  userId: string,
  userRole: Role = Role.USER
): Promise<void> {
  try {
    await requireThreadAccessOrThrow(threadId, userId, userRole);
  } catch {
    redirect('/dashboard');
  }
}

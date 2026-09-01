/**
 * Thread access control — replaces ThreadMember-based checks.
 *
 * Visibility rule (private/restricted threads):
 *   creator OR accepted ThreadInvitation OR global MODERATOR/ADMIN
 * Public threads are readable by anyone; write still requires session.
 */

import { Prisma, Role, ThreadVisibility } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';
import { AppError } from '@/lib/utils/errors';
import { redirect } from 'next/navigation';
import { canModerate } from '@/lib/config/permissions';

export interface ThreadAccessContext {
  threadId: string;
  createdBy: string | null;
  visibility: ThreadVisibility;
}

export function buildInvitationMatch(
  memberUserId: string,
  email?: string | null
): Prisma.ThreadInvitationWhereInput[] {
  const match: Prisma.ThreadInvitationWhereInput[] = [{ senderId: memberUserId }];
  if (email) {
    match.push({ email });
  }
  return match;
}

export async function getUserEmail(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  return user?.email ?? null;
}

export async function canAccessThread(
  thread: ThreadAccessContext,
  userId?: string | null,
  userRole?: Role | null
): Promise<boolean> {
  if (thread.visibility === 'PUBLIC') return true;
  if (!userId) return false;
  if (canModerate(userRole ?? Role.USER)) return true;
  if (thread.createdBy === userId) return true;

  const senderInvitation = await prisma.threadInvitation.findFirst({
    where: { threadId: thread.threadId, status: 'ACCEPTED', senderId: userId },
    select: { id: true },
  });
  if (senderInvitation) return true;

  // Invitations are also addressed by email, so fall back to an email match.
  // Consolidated behind buildInvitationMatch so the OR logic lives in one place.
  const email = await getUserEmail(userId);
  if (!email) return false;

  const invitationMatch = buildInvitationMatch(userId, email);
  const emailInvitation = await prisma.threadInvitation.findFirst({
    where: { threadId: thread.threadId, status: 'ACCEPTED', OR: invitationMatch },
    select: { id: true },
  });

  return emailInvitation !== null;
}

/**
 * Query-level mirror of `canAccessThread`: non-public threads are only visible
 * to their creator or to someone with an accepted invitation (matched by sender
 * id or by the email the invitation was addressed to). Moderators and admins
 * see everything, matching `canAccessThread`.
 *
 * Without a user id only PUBLIC threads are visible.
 */
export async function visibilityFilter(
  memberUserId?: string,
  userRole?: Role | null
): Promise<Prisma.ThreadWhereInput> {
  if (canModerate(userRole ?? Role.USER)) {
    return {};
  }

  if (!memberUserId) {
    return { visibility: 'PUBLIC' };
  }

  const email = await getUserEmail(memberUserId);
  const invitationMatch = buildInvitationMatch(memberUserId, email);

  return {
    OR: [
      { visibility: 'PUBLIC' },
      { createdBy: memberUserId },
      { invitations: { some: { status: 'ACCEPTED', OR: invitationMatch } } },
    ],
  };
}

export async function canWriteToThread(
  thread: ThreadAccessContext,
  userId: string,
  userRole: Role
): Promise<boolean> {
  if (canModerate(userRole)) return true;
  if (thread.visibility === 'PUBLIC') return true;
  return canAccessThread(thread, userId, userRole);
}

export function canManageThread(
  thread: ThreadAccessContext,
  userId: string,
  userRole: Role
): boolean {
  return canModerate(userRole) || thread.createdBy === userId;
}

async function loadThreadContext(threadId: string): Promise<ThreadAccessContext> {
  const thread = await prisma.thread.findUnique({
    where: { id: threadId, deletedAt: null },
    select: { id: true, createdBy: true, visibility: true },
  });

  if (!thread) {
    throw new AppError('Thread not found', 'NOT_FOUND', 404);
  }

  return { threadId: thread.id, createdBy: thread.createdBy, visibility: thread.visibility };
}

export async function requireThreadAccessOrThrow(
  threadId: string,
  userId: string,
  userRole: Role = Role.USER
): Promise<void> {
  const thread = await loadThreadContext(threadId);
  if (!(await canAccessThread(thread, userId, userRole))) {
    throw new AppError('Forbidden: no access to this thread', 'FORBIDDEN', 403);
  }
}

export async function requireThreadWriteOrThrow(
  threadId: string,
  userId: string,
  userRole: Role = Role.USER
): Promise<void> {
  const thread = await loadThreadContext(threadId);
  if (!(await canWriteToThread(thread, userId, userRole))) {
    throw new AppError('Forbidden: cannot write to this thread', 'FORBIDDEN', 403);
  }
}

/** Page/server-component variant — bounces to the dashboard instead of throwing. */
export async function requireThreadAccess(
  threadId: string,
  userId: string,
  userRole: Role = Role.USER
): Promise<void> {
  try {
    await requireThreadAccessOrThrow(threadId, userId, userRole);
  } catch (error) {
    // Access outcomes (no permission / no thread) bounce to the dashboard.
    // Infrastructure failures must still reach the error boundary instead of
    // masquerading as "no access".
    if (AppError.isAppError(error)) {
      redirect('/dashboard');
    }
    throw error;
  }
}

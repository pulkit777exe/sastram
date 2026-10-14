/**
 * Thread access control — replaces ThreadMember-based checks.
 *
 * Visibility rule (private/restricted threads):
 *   creator OR accepted ThreadInvitation OR global MODERATOR/ADMIN
 * Public threads are readable by anyone; write still requires session.
 *
 * Ban rule: an active, unexpired UserBan (thread-scoped OR site-wide
 * `threadId: null`) blocks writes even when the visibility rule would allow
 * them — including the thread creator. Only global MODERATOR/ADMIN bypass.
 * Reads are unaffected: bans restrict participation, not visibility.
 *
 * RLS note: row-level security is not enabled on Neon; access is enforced
 * at the application layer via canAccessThread/visibilityFilter. If RLS is
 * added, mirror this logic in a policy on threads + thread_invitations.
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

/**
 * Data-access seam behind the access rules. The default implementation reads
 * Prisma; tests inject an in-memory fake via `createThreadAccessPolicy`.
 * Rule evaluation itself is store-agnostic (see `evaluateRead` below).
 */
export interface ThreadAccessStore {
  loadThread(threadId: string): Promise<ThreadAccessContext | null>;
  findInvitation(threadId: string, userId: string): Promise<{ id: string } | null>;
  findInvitationByEmail(
    threadId: string,
    match: Prisma.ThreadInvitationWhereInput[]
  ): Promise<{ id: string } | null>;
  /** Active, unexpired thread-scoped or site-wide (`threadId: null`) ban. */
  findActiveBan(threadId: string, userId: string): Promise<{ id: string } | null>;
  getUserEmail(userId: string): Promise<string | null>;
  getUserRole(userId: string): Promise<Role | null>;
}

export const prismaThreadAccessStore: ThreadAccessStore = {
  async loadThread(threadId) {
    const foundThread = await prisma.thread.findUnique({
      where: { id: threadId, deletedAt: null },
      select: { id: true, createdBy: true, visibility: true },
    });
    if (foundThread === null || foundThread === undefined) return null;
    return { threadId: foundThread.id, createdBy: foundThread.createdBy, visibility: foundThread.visibility };
  },
  async findInvitation(threadId, userId) {
    return prisma.threadInvitation.findFirst({
      where: { threadId, status: 'ACCEPTED', senderId: userId },
      select: { id: true },
    });
  },
  async findInvitationByEmail(threadId, match) {
    return prisma.threadInvitation.findFirst({
      where: { threadId, status: 'ACCEPTED', OR: match },
      select: { id: true },
    });
  },
  async findActiveBan(threadId, userId) {
    const now = new Date();
    return prisma.userBan.findFirst({
      where: {
        userId,
        isActive: true,
        OR: [{ threadId }, { threadId: null }],
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      },
      select: { id: true },
    });
  },
  async getUserEmail(userId) {
    const foundUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (foundUser === null || foundUser.email === null || foundUser.email === undefined) return null;
    return foundUser.email;
  },
  async getUserRole(userId) {
    const foundUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    return foundUser?.role ?? null;
  },
};

/** In-memory store for tests — no DB required. */
export function createFakeThreadAccessStore(seed: {
  threads: ThreadAccessContext[];
  invitations?: { threadId: string; userId?: string; email?: string }[];
  users?: { id: string; email?: string | null; role?: Role }[];
  bans?: { threadId: string | null; userId: string; expiresAt?: Date | null }[];
} = { threads: [] }): ThreadAccessStore {
  const threads = new Map(seed.threads.map((t) => [t.threadId, t]));
  const invitations = seed.invitations ?? [];
  const users = new Map((seed.users ?? []).map((u) => [u.id, u]));
  const bans = seed.bans ?? [];
  const accepted = (threadId: string, userId: string, email: string | null) =>
    invitations.some(
      (inv) =>
        inv.threadId === threadId &&
        (inv.userId === userId || (email !== null && inv.email === email))
    );
  const banned = (threadId: string, userId: string) => {
    const now = Date.now();
    return bans.some(
      (b) =>
        b.userId === userId &&
        (b.threadId === null || b.threadId === threadId) &&
        (b.expiresAt === null || b.expiresAt === undefined || b.expiresAt.getTime() > now)
    );
  };
  return {
    async loadThread(threadId) {
      return threads.get(threadId) ?? null;
    },
    async findInvitation(threadId, userId) {
      return accepted(threadId, userId, null) ? { id: `${threadId}:${userId}` } : null;
    },
    async findInvitationByEmail(threadId, match) {
      const email = match
        .map((m) => (typeof m.email === 'string' ? m.email : null))
        .find((e): e is string => e !== null) ?? null;
      return accepted(threadId, '', email) ? { id: `${threadId}:${email}` } : null;
    },
    async findActiveBan(threadId, userId) {
      return banned(threadId, userId) ? { id: `ban:${threadId}:${userId}` } : null;
    },
    async getUserEmail(userId) {
      return users.get(userId)?.email ?? null;
    },
    async getUserRole(userId) {
      return users.get(userId)?.role ?? null;
    },
  };
}

async function evaluateRead(
  thread: ThreadAccessContext,
  userId: string | null | undefined,
  userRole: Role | null | undefined,
  store: ThreadAccessStore
): Promise<boolean> {
  if (thread.visibility === 'PUBLIC') return true;
  if (userId === undefined || userId === null || userId.length === 0) return false;

  const effectiveRole = userRole ?? Role.USER;
  if (canModerate(effectiveRole)) return true;
  if (thread.createdBy === userId) return true;

  const senderInvitation = await store.findInvitation(thread.threadId, userId);
  if (senderInvitation !== null) return true;

  // Invitations are also addressed by email, so fall back to an email match.
  const userEmail = await store.getUserEmail(userId);
  if (userEmail === null || userEmail.length === 0) return false;

  const invitationMatch = buildInvitationMatch(userId, userEmail);
  const emailInvitation = await store.findInvitationByEmail(thread.threadId, invitationMatch);

  return emailInvitation !== null;
}

/** Single write rule shared by `canWrite` and `requireWrite` (one locality). */
async function evaluateWrite(
  thread: ThreadAccessContext,
  userId: string,
  userRole: Role | null | undefined,
  store: ThreadAccessStore
): Promise<boolean> {
  if (canModerate(userRole ?? Role.USER)) return true;
  if ((await store.findActiveBan(thread.threadId, userId)) !== null) return false;
  if (thread.visibility === 'PUBLIC') return true;
  return evaluateRead(thread, userId, userRole, store);
}

/** Injectable access policy — the seam. Default singleton is Prisma-backed. */
export interface ThreadAccessPolicy {
  canRead(thread: ThreadAccessContext, userId?: string | null, userRole?: Role | null): Promise<boolean>;
  canWrite(thread: ThreadAccessContext, userId: string, userRole: Role): Promise<boolean>;
  canManage(thread: ThreadAccessContext, userId: string, userRole: Role): boolean;
  /** Single-row check for already-loaded rows (resolves role via the store). */
  canReadRow(row: ThreadAccessContext, userId?: string): Promise<boolean>;
  requireRead(threadId: string, userId: string, role?: Role): Promise<ThreadAccessContext>;
  requireWrite(threadId: string, userId: string, role?: Role): Promise<ThreadAccessContext>;
  requireManage(threadId: string, userId: string, role?: Role): Promise<ThreadAccessContext>;
  visibilityFilter(userId?: string, userRole?: Role | null): Promise<Prisma.ThreadWhereInput>;
}

export function createThreadAccessPolicy(store: ThreadAccessStore): ThreadAccessPolicy {
  async function loadOrThrow(threadId: string): Promise<ThreadAccessContext> {
    const ctx = await store.loadThread(threadId);
    if (ctx === null || ctx === undefined) {
      throw new AppError('Thread not found', 'NOT_FOUND', HTTP_NOT_FOUND);
    }
    return ctx;
  }
  return {
    canRead: (thread, userId, userRole) => evaluateRead(thread, userId, userRole, store),
    canWrite: async (thread, userId, userRole) => evaluateWrite(thread, userId, userRole, store),
    canManage: (thread, userId, userRole) => canManageThread(thread, userId, userRole),
    canReadRow: async (row, userId) => {
      if (row.visibility === 'PUBLIC') return true;
      if (!userId) return false;
      const role = (await store.getUserRole(userId)) ?? Role.USER;
      return evaluateRead(row, userId, role, store);
    },
    requireRead: async (threadId, userId, role) => {
      const ctx = await loadOrThrow(threadId);
      if (!(await evaluateRead(ctx, userId, role ?? Role.USER, store))) {
        throw new AppError('Forbidden: no access to this thread', 'FORBIDDEN', HTTP_FORBIDDEN);
      }
      return ctx;
    },
    requireWrite: async (threadId, userId, role) => {
      const ctx = await loadOrThrow(threadId);
      if (!(await evaluateWrite(ctx, userId, role, store))) {
        throw new AppError('Forbidden: cannot write to this thread', 'FORBIDDEN', HTTP_FORBIDDEN);
      }
      return ctx;
    },
    requireManage: async (threadId, userId, role) => {
      const ctx = await loadOrThrow(threadId);
      if (!canManageThread(ctx, userId, role ?? Role.USER)) {
        throw new AppError('Forbidden: cannot manage this thread', 'FORBIDDEN', HTTP_FORBIDDEN);
      }
      return ctx;
    },
    visibilityFilter: async (userId, userRole) => {
      const effectiveRole = userRole ?? Role.USER;
      if (canModerate(effectiveRole)) return {};
      if (userId === undefined || userId === null || userId.length === 0) {
        return { visibility: 'PUBLIC' };
      }
      const userEmail = await store.getUserEmail(userId);
      const invitationMatch = buildInvitationMatch(userId, userEmail);
      return {
        OR: [
          { visibility: 'PUBLIC' },
          { createdBy: userId },
          { invitations: { some: { status: 'ACCEPTED', OR: invitationMatch } } },
        ],
      };
    },
  };
}

export const threadAccessPolicy: ThreadAccessPolicy = createThreadAccessPolicy(prismaThreadAccessStore);

export async function canAccessThread(
  thread: ThreadAccessContext,
  userId?: string | null,
  userRole?: Role | null
): Promise<boolean> {
  return threadAccessPolicy.canRead(thread, userId, userRole);
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
  return threadAccessPolicy.visibilityFilter(memberUserId, userRole);
}

export async function canWriteToThread(
  thread: ThreadAccessContext,
  userId: string,
  userRole: Role
): Promise<boolean> {
  return threadAccessPolicy.canWrite(thread, userId, userRole);
}

export function canManageThread(
  thread: ThreadAccessContext,
  userId: string,
  userRole: Role
): boolean {
  return canModerate(userRole) || thread.createdBy === userId;
}

// Canonical aliases going forward. `canAccessThread`/`canWriteToThread` remain
// as the underlying implementations; new code should use `canReadThread`/
// `canWriteThread`.
export const canReadThread = canAccessThread;
export const canWriteThread = canWriteToThread;

const HTTP_NOT_FOUND = 404;
const HTTP_FORBIDDEN = 403;

/**
 * Canonical read gate — resolves the thread ONCE and returns its context so
 * callers stop re-fetching (use `ctx.createdBy`/`ctx.visibility` directly).
 * Missing thread → NOT_FOUND (404); no access → FORBIDDEN (403).
 */
export async function requireReadOrThrow(
  threadId: string,
  userId: string,
  role?: Role
): Promise<ThreadAccessContext> {
  return threadAccessPolicy.requireRead(threadId, userId, role);
}

/**
 * Canonical write gate — resolves the thread ONCE and returns its context.
 * Missing thread → NOT_FOUND (404); no write access → FORBIDDEN (403).
 */
export async function requireWriteOrThrow(
  threadId: string,
  userId: string,
  role?: Role
): Promise<ThreadAccessContext> {
  return threadAccessPolicy.requireWrite(threadId, userId, role);
}

/**
 * NEW: management gate (thread creator or global MODERATOR/ADMIN).
 * Missing thread → NOT_FOUND (404); otherwise → FORBIDDEN (403).
 * `canManageThread` stays sync (no DB) — this wrapper only adds the load.
 */
export async function requireManageOrThrow(
  threadId: string,
  userId: string,
  role?: Role
): Promise<ThreadAccessContext> {
  return threadAccessPolicy.requireManage(threadId, userId, role);
}

/** Page/server-component variant — bounces to the dashboard instead of throwing. */
export async function requireReadOrRedirect(
  threadId: string,
  userId: string,
  role?: Role
): Promise<void> {
  try {
    await requireReadOrThrow(threadId, userId, role);
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

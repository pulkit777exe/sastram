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
 * RLS note: this project does not enable row-level security in its migrations;
 * access is enforced at the application layer via canAccessThread/visibilityFilter.
 * Neon supports Postgres RLS. If it is enabled, mirror this logic in policies on
 * threads + thread_invitations and use an application role that cannot bypass RLS.
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

/** Viewer facts needed to decide read access without another round-trip. */
export interface ThreadViewerSnapshot {
  id: string;
  email: string | null;
  role: Role;
}

/**
 * Thread row plus the accepted invitations relevant to a batch of viewers.
 * Produced by the batched prefilter query; `canReadFromSnapshot` is the exact
 * gate (the query itself is deliberately coarse).
 */
export interface ThreadReadSnapshot extends ThreadAccessContext {
  acceptedInvitations: { inviteeId: string | null; email: string }[];
}

export function buildInvitationMatch(
  memberUserId: string,
  email?: string | null
): Prisma.ThreadInvitationWhereInput[] {
  // senderId is the inviter, NOT the invitee. The invitee is the accepting
  // user (inviteeId, set at acceptance) or — for rows accepted before
  // inviteeId existed — the invitation's email address.
  const match: Prisma.ThreadInvitationWhereInput[] = [{ inviteeId: memberUserId }];
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
    const userEmail = await this.getUserEmail(userId);
    return prisma.threadInvitation.findFirst({
      where: { threadId, status: 'ACCEPTED', OR: buildInvitationMatch(userId, userEmail) },
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

  const invitation = await store.findInvitation(thread.threadId, userId);
  return invitation !== null;
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

/**
 * Bulk read check for fan-out paths (digests, notifications). Subscriptions
 * are not proof of access: invitations can be revoked and a thread can become
 * private after someone subscribes. Resolve the thread's access set once with
 * a constant number of queries instead of trusting stored subscriber lists.
 */
export async function filterReadableUserIds(
  thread: ThreadAccessContext,
  userIds: string[]
): Promise<string[]> {
  if (thread.visibility === 'PUBLIC') return userIds;

  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, email: true, role: true },
  });
  if (users.length === 0) return [];

  const allowed = new Set<string>();
  const emails: string[] = [];
  for (const user of users) {
    if (canModerate(user.role) || thread.createdBy === user.id) {
      allowed.add(user.id);
      continue;
    }
    if (user.email) emails.push(user.email);
  }

  const invitations = await prisma.threadInvitation.findMany({
    where: {
      threadId: thread.threadId,
      status: 'ACCEPTED',
      OR: [
        { inviteeId: { in: uniqueIds } },
        ...(emails.length > 0 ? [{ email: { in: emails } }] : []),
      ],
    },
    select: { inviteeId: true, email: true },
  });

  if (invitations.length > 0) {
    const invitedInvitees = new Set(
      invitations.map((invitation) => invitation.inviteeId).filter((id): id is string => typeof id === 'string')
    );
    const invitedEmails = new Set(invitations.map((invitation) => invitation.email));
    for (const user of users) {
      if (allowed.has(user.id)) continue;
      if (invitedInvitees.has(user.id) || (user.email !== null && invitedEmails.has(user.email))) {
        allowed.add(user.id);
      }
    }
  }

  return uniqueIds.filter((id) => allowed.has(id));
}

/**
 * Exact read decision from pre-loaded rows — the snapshot counterpart of
 * `evaluateRead`/`canAccessThread`. Mirrors it clause for clause: public
 * threads are open; anonymous viewers see only public; moderators/admins and
 * the creator pass; otherwise an accepted invitation by invitee id or exact
 * email address is required. Missing/deleted threads deny.
 */
export function canReadFromSnapshot(
  thread: ThreadReadSnapshot | null,
  viewer: ThreadViewerSnapshot | null
): boolean {
  if (thread === null) return false;
  if (thread.visibility === 'PUBLIC') return true;
  if (viewer === null || viewer.id.length === 0) return false;
  if (canModerate(viewer.role)) return true;
  if (thread.createdBy === viewer.id) return true;
  return thread.acceptedInvitations.some(
    (invitation) =>
      invitation.inviteeId === viewer.id ||
      (viewer.email !== null && viewer.email.length > 0 && invitation.email === viewer.email)
  );
}

/**
 * Coarse query-level prefilter for a page of digest subscriptions: fetch only
 * threads at least one viewer might read. The result is NOT the access
 * decision — `canReadFromSnapshot` must make the final call. Moderators read
 * everything, so any moderator in the page drops all visibility conditions;
 * with no signed-in viewers only public threads are candidates.
 */
export function buildBatchVisibilityFilter(
  viewers: ThreadViewerSnapshot[],
  threadIds: string[]
): Prisma.ThreadWhereInput {
  const base: Prisma.ThreadWhereInput = { id: { in: threadIds }, deletedAt: null };
  if (viewers.some((viewer) => canModerate(viewer.role))) return base;

  const viewerIds = [
    ...new Set(viewers.map((viewer) => viewer.id).filter((id) => id.length > 0)),
  ];
  if (viewerIds.length === 0) return { ...base, visibility: 'PUBLIC' };

  const emails = [
    ...new Set(
      viewers
        .map((viewer) => viewer.email)
        .filter((email): email is string => email !== null && email.length > 0)
    ),
  ];

  return {
    ...base,
    OR: [
      { visibility: 'PUBLIC' },
      { createdBy: { in: viewerIds } },
      {
        invitations: {
          some: {
            status: 'ACCEPTED',
            OR: [
              { inviteeId: { in: viewerIds } },
              ...(emails.length > 0 ? [{ email: { in: emails } }] : []),
            ],
          },
        },
      },
    ],
  };
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

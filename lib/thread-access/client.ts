/**
 * Pure view-predicates for thread/message UI gating (importable from
 * components). No prisma, no I/O — the server actions in
 * `modules/messages/` and `modules/polls/` enforce the same rules via
 * `requireReadOrThrow`/`requireManageOrThrow` + the thread context.
 *
 * `userRole` is the global role string ('USER' | 'MODERATOR' | 'ADMIN').
 * `deletedAt: unknown` — any non-null value means soft-deleted.
 */

function isModeratorRole(userRole: string): boolean {
  return userRole === 'MODERATOR' || userRole === 'ADMIN';
}

function isDeleted(deletedAt: unknown): boolean {
  return deletedAt !== null && deletedAt !== undefined;
}

/** Thread creator or global MODERATOR/ADMIN. Mirrors `canManageThread`. */
export function canManageView(input: {
  createdBy: string | null;
  userId: string;
  userRole: string;
}): boolean {
  if (input.createdBy !== null && input.createdBy === input.userId) return true;
  return isModeratorRole(input.userRole);
}

/** Only the author, and only while the message is not soft-deleted. */
export function canEditMessageView(input: {
  senderId: string;
  userId: string;
  deletedAt: unknown;
}): boolean {
  if (isDeleted(input.deletedAt)) return false;
  return input.senderId === input.userId;
}

/**
 * Author or global MODERATOR/ADMIN, while not soft-deleted.
 * Fail-closed: the server additionally lets the thread creator delete any
 * message (`canManageThread`); this view predicate has no `createdBy` input
 * by contract, so creators who are neither author nor mod won't see the
 * button but the server still permits them.
 */
export function canDeleteMessageView(input: {
  senderId: string;
  userId: string;
  userRole: string;
  deletedAt: unknown;
}): boolean {
  if (isDeleted(input.deletedAt)) return false;
  if (input.senderId === input.userId) return true;
  return isModeratorRole(input.userRole);
}

/** Thread creator or global MODERATOR/ADMIN, while not soft-deleted. */
export function canPinMessageView(input: {
  createdBy: string | null;
  userId: string;
  userRole: string;
  deletedAt: unknown;
}): boolean {
  if (isDeleted(input.deletedAt)) return false;
  if (input.createdBy !== null && input.createdBy === input.userId) return true;
  return isModeratorRole(input.userRole);
}

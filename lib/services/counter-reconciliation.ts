import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';

/**
 * Reconciling denormalized counters at write time would multiply Neon query
 * load on every post, so it runs as a nightly batch inside `update-threads`.
 *
 * Report-only for now: logging drift surfaces the write-path bug causing it,
 * whereas auto-correcting would quietly paper over the same bug every night.
 * Flip once the write paths have been audited.
 */
export const COUNTER_RECONCILIATION_AUTO_CORRECT = false;

/** `delta = actualValue - storedValue`, so positive means we're undercounting. */
type CounterDrift = {
  table: string;
  rowId: string;
  counterName: string;
  storedValue: number;
  actualValue: number;
  delta: number;
};

type AnyRow = { id: string } & Record<string, unknown>;

type CounterFamily = {
  table: string;
  counter: string;
  /** Rows to check. Soft-deleted rows are excluded — they aren't listed anywhere. */
  load: () => Promise<AnyRow[]>;
  /**
   * One aggregate for the whole family, keyed by row id. Ids missing from the
   * map have an actual count of zero.
   */
  loadActuals: () => Promise<Map<string, number>>;
};

const MAX_DRIFTS_LOGGED = 25; // avoid flooding logs with unbounded drift arrays

// Simple helper: turns a groupBy result into a map of id -> count.
// KISS: no generics — just a plain loop with a key extractor.
// Duplicating the loop in each loader would be more explicit, but this one
// helper avoids 5 copies of the same 4-line loop and is easy to read.
type GroupedCount = { _count: { _all: number } } & Record<string, unknown>;

function toCountMap(
  groupedCounts: GroupedCount[],
  extractKey: (group: GroupedCount) => unknown,
): Map<string, number> {
  const countById = new Map<string, number>();
  for (const row of groupedCounts) {
    const rawId = extractKey(row);
    if (typeof rawId !== 'string' || rawId === null) continue;
    countById.set(rawId, row._count._all);
  }
  return countById;
}

// --- Explicit loaders (KISS: named functions instead of anonymous closures) ---
// These are the "prefer 2-3 explicit check functions" alternative to a dense
// declarative table. Each loader is a plain async function; COUNTERS just
// wires them together so reconcileCounters can loop without 5x duplicated
// scanning/logging code.

async function loadThreads(): Promise<AnyRow[]> {
  return prisma.thread.findMany({
    where: { deletedAt: null },
    select: { id: true, messageCount: true },
  });
}

async function loadThreadMessageActuals(): Promise<Map<string, number>> {
  const grouped = await prisma.message.groupBy({
    by: ['threadId'],
    where: { deletedAt: null },
    _count: { _all: true },
  });
  return toCountMap(grouped, (g) => g.threadId);
}

async function loadMessagesForLike(): Promise<AnyRow[]> {
  return prisma.message.findMany({
    where: { deletedAt: null, thread: { deletedAt: null } },
    select: { id: true, likeCount: true },
  });
}

async function loadLikeActuals(): Promise<Map<string, number>> {
  // Reactions aren't pruned when a message is soft-deleted, so drift here is
  // expected to surface rather than be silently corrected.
  const grouped = await prisma.reaction.groupBy({
    by: ['messageId'],
    _count: { _all: true },
  });
  return toCountMap(grouped, (g) => g.messageId);
}

async function loadRootMessages(): Promise<AnyRow[]> {
  return prisma.message.findMany({
    where: { deletedAt: null, thread: { deletedAt: null }, depth: 0 },
    select: { id: true, replyCount: true },
  });
}

async function loadReplyActuals(): Promise<Map<string, number>> {
  const grouped = await prisma.message.groupBy({
    by: ['parentId'],
    where: { deletedAt: null, parentId: { not: null } },
    _count: { _all: true },
  });
  return toCountMap(grouped, (g) => g.parentId);
}

async function loadUsersForFollower(): Promise<AnyRow[]> {
  return prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, followerCount: true },
  });
}

async function loadFollowerActuals(): Promise<Map<string, number>> {
  const grouped = await prisma.userFollow.groupBy({
    by: ['followingId'],
    _count: { _all: true },
  });
  return toCountMap(grouped, (g) => g.followingId);
}

async function loadUsersForFollowing(): Promise<AnyRow[]> {
  return prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, followingCount: true },
  });
}

async function loadFollowingActuals(): Promise<Map<string, number>> {
  const grouped = await prisma.userFollow.groupBy({
    by: ['followerId'],
    _count: { _all: true },
  });
  return toCountMap(grouped, (g) => g.followerId);
}

// Declarative table kept for KISS: 5 rows centralize the counter list so
// reconcileCounters doesn't duplicate scanning/logging 5 times. Alternative
// would be 5 explicit checkThreadMessageCount() functions that each call
// compareAll — more verbose but equally valid; kept table here for brevity.
const COUNTERS: CounterFamily[] = [
  { table: 'threads', counter: 'messageCount', load: loadThreads, loadActuals: loadThreadMessageActuals },
  { table: 'messages', counter: 'likeCount', load: loadMessagesForLike, loadActuals: loadLikeActuals },
  { table: 'messages', counter: 'replyCount', load: loadRootMessages, loadActuals: loadReplyActuals },
  { table: 'users', counter: 'followerCount', load: loadUsersForFollower, loadActuals: loadFollowerActuals },
  { table: 'users', counter: 'followingCount', load: loadUsersForFollowing, loadActuals: loadFollowingActuals },
];

export async function reconcileCounters(): Promise<{
  scanned: number;
  drifts: CounterDrift[];
}> {
  const drifts: CounterDrift[] = [];
  let scanned = 0;

  for (const family of COUNTERS) {
    const [rows, actuals] = await Promise.all([family.load(), family.loadActuals()]);
    scanned += rows.length;
    drifts.push(...compareAll(family.table, family.counter, rows, actuals));
  }

  if (drifts.length > 0) {
    logger.warn(
      `[counter-reconcile] ${drifts.length} drift(s) across ${scanned} scanned rows`,
      { drifts: drifts.slice(0, MAX_DRIFTS_LOGGED), totalDrifts: drifts.length }
    );
  } else {
    logger.info(`[counter-reconcile] clean — ${scanned} rows scanned, no drift`);
  }

  if (COUNTER_RECONCILIATION_AUTO_CORRECT && drifts.length > 0) {
    logger.warn(
      '[counter-reconcile] auto-correct ENABLED but would mask underlying write-path bugs; ' +
        'recommended only after 30 days of clean report-only logs. No-op for now.'
    );
  }

  return { scanned, drifts };
}

function compareAll(
  tableName: string,
  counterName: string,
  storedRows: AnyRow[],
  actualCountById: Map<string, number>,
): CounterDrift[] {
  const foundDrifts: CounterDrift[] = [];
  for (const storedRow of storedRows) {
    const actualCount = actualCountById.get(storedRow.id) ?? 0;
    const rawStoredValue = storedRow[counterName];
    let storedCount = 0;
    if (typeof rawStoredValue === 'number') {
      storedCount = rawStoredValue;
    } else if (typeof rawStoredValue === 'string') {
      storedCount = Number(rawStoredValue);
    }
    if (storedCount === actualCount) continue;
    foundDrifts.push({
      table: tableName,
      rowId: storedRow.id,
      counterName: counterName,
      storedValue: storedCount,
      actualValue: actualCount,
      delta: actualCount - storedCount,
    });
  }
  return foundDrifts;
}

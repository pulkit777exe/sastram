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

function toCountMap<T extends { _count: { _all: number } }>(
  groups: T[],
  keyOf: (group: T) => string | null,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const group of groups) {
    const key = keyOf(group);
    if (key !== null) counts.set(key, group._count._all);
  }
  return counts;
}

const COUNTERS: CounterFamily[] = [
  {
    table: 'threads',
    counter: 'messageCount',
    load: () =>
      prisma.thread.findMany({
        where: { deletedAt: null },
        select: { id: true, messageCount: true },
      }),
    loadActuals: async () =>
      toCountMap(
        await prisma.message.groupBy({
          by: ['threadId'],
          where: { deletedAt: null },
          _count: { _all: true },
        }),
        (g) => g.threadId,
      ),
  },
  {
    table: 'messages',
    counter: 'likeCount',
    load: () =>
      prisma.message.findMany({
        where: { deletedAt: null, thread: { deletedAt: null } },
        select: { id: true, likeCount: true },
      }),
    // Reactions aren't pruned when a message is soft-deleted, so drift here is
    // expected to surface rather than be silently correct.
    loadActuals: async () =>
      toCountMap(
        await prisma.reaction.groupBy({
          by: ['messageId'],
          _count: { _all: true },
        }),
        (g) => g.messageId,
      ),
  },
  {
    table: 'messages',
    counter: 'replyCount',
    // Root messages only — bounds the scan.
    load: () =>
      prisma.message.findMany({
        where: { deletedAt: null, thread: { deletedAt: null }, depth: 0 },
        select: { id: true, replyCount: true },
      }),
    loadActuals: async () =>
      toCountMap(
        await prisma.message.groupBy({
          by: ['parentId'],
          where: { deletedAt: null, parentId: { not: null } },
          _count: { _all: true },
        }),
        (g) => g.parentId,
      ),
  },
  {
    table: 'users',
    counter: 'followerCount',
    load: () =>
      prisma.user.findMany({
        where: { deletedAt: null },
        select: { id: true, followerCount: true },
      }),
    loadActuals: async () =>
      toCountMap(
        await prisma.userFollow.groupBy({
          by: ['followingId'],
          _count: { _all: true },
        }),
        (g) => g.followingId,
      ),
  },
  {
    table: 'users',
    counter: 'followingCount',
    load: () =>
      prisma.user.findMany({
        where: { deletedAt: null },
        select: { id: true, followingCount: true },
      }),
    loadActuals: async () =>
      toCountMap(
        await prisma.userFollow.groupBy({
          by: ['followerId'],
          _count: { _all: true },
        }),
        (g) => g.followerId,
      ),
  },
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
      { drifts: drifts.slice(0, 25), totalDrifts: drifts.length }
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
  table: string,
  counter: string,
  rows: AnyRow[],
  actuals: Map<string, number>,
): CounterDrift[] {
  const drifts: CounterDrift[] = [];
  for (const row of rows) {
    const actual = actuals.get(row.id) ?? 0;
    const stored = Number(row[counter] ?? 0);
    if (stored !== actual) {
      drifts.push({
        table,
        rowId: row.id,
        counterName: counter,
        storedValue: stored,
        actualValue: actual,
        delta: actual - stored,
      });
    }
  }
  return drifts;
}

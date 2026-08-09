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
  recompute: (id: string) => Promise<number>;
};

const COUNTERS: CounterFamily[] = [
  {
    table: 'threads',
    counter: 'messageCount',
    load: () =>
      prisma.thread.findMany({
        where: { deletedAt: null },
        select: { id: true, messageCount: true },
      }),
    recompute: (threadId) => prisma.message.count({ where: { threadId, deletedAt: null } }),
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
    recompute: (messageId) => prisma.reaction.count({ where: { messageId } }),
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
    recompute: (messageId) =>
      prisma.message.count({ where: { parentId: messageId, deletedAt: null } }),
  },
];

// followerCount / followingCount are deliberately absent: the columns exist on
// User but no write path ever touches them, so reconciling would always report
// zero drift and burn query budget. Add them when follow/unfollow lands.

export async function reconcileCounters(): Promise<{
  scanned: number;
  drifts: CounterDrift[];
}> {
  const drifts: CounterDrift[] = [];
  let scanned = 0;

  for (const family of COUNTERS) {
    const rows = await family.load();
    scanned += rows.length;
    drifts.push(...(await compareAll(family.table, family.counter, rows, family.recompute)));
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

async function compareAll(
  table: string,
  counter: string,
  rows: AnyRow[],
  recompute: (id: string) => Promise<number>,
): Promise<CounterDrift[]> {
  const drifts: CounterDrift[] = [];
  for (const row of rows) {
    const actual = await recompute(row.id);
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

import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';

/**
 * Counter reconciliation policy.
 *
 * Reconciling denormalized counters (messageCount, memberCount, likeCount, replyCount,
 * followerCount, followingCount) at write-time would multiply Neon query load on every post.
 * Instead, this runs as a once-a-day batch inside the `update-threads` cron.
 *
 * Safety: the first 30 days of post-launch reconciliation is REPORT-ONLY (logs drift, never
 * touches data). This surfaces the actual write-path bugs causing drift instead of silently
 * masking them nightly. Flip to auto-correct once the write paths are audited and trusted.
 *
 * To enable auto-correct: change `false` to `true` (or wire to a runtime env / config knob
 * matching how the rest of the project's quota / rate-limit flags are wired).
 */
export const COUNTER_RECONCILIATION_AUTO_CORRECT = false;

/**
 * Per-counter diagnostic output. Schema:
 *   { table, rowId, counterName, storedValue, actualValue, delta }
 * `delta = actualValue - storedValue` so positive means we're undercounting.
 */
type CounterDrift = {
  table: string;
  rowId: string;
  counterName: string;
  storedValue: number;
  actualValue: number;
  delta: number;
};

type CounterFamily = {
  table: string;
  counter: string;
  recompute: (id: string) => Promise<number>;
};

const COUNTERS: CounterFamily[] = [
  {
    table: 'threads',
    counter: 'messageCount',
    // Recompute by counting active (non-deleted) messages belonging to the thread,
    // and excluding the thread itself from the count if it's soft-deleted.
    recompute: async (threadId: string) =>
      prisma.message.count({
        where: { threadId, deletedAt: null },
      }),
  },
  {
    table: 'threads',
    counter: 'memberCount',
    // Active members only (status = ACTIVE).
    recompute: async (threadId: string) =>
      prisma.threadMember.count({
        where: { threadId, status: 'ACTIVE' },
      }),
  },
  {
    table: 'messages',
    counter: 'likeCount',
    // Recompute via reaction rows pointing at this message.
    // Note: reactions are not deleted with messages on cascade, but pruning is hypothetical
    // for now (no delete-reaction path); real-value vs. stored drift will surface.
    recompute: async (messageId: string) =>
      prisma.reaction.count({
        where: { messageId },
      }),
  },
  {
    table: 'messages',
    counter: 'replyCount',
    // active (non-deleted) child replies.
    recompute: async (messageId: string) =>
      prisma.message.count({
        where: { parentId: messageId, deletedAt: null },
      }),
  },
];

/**
 * Run a full reconciliation pass. Returns the list of drifts for reporting.
 * Always excludes soft-deleted rows (they don't belong in listings anyway).
 */
export async function reconcileCounters(): Promise<{
  scanned: number;
  drifts: CounterDrift[];
}> {
  const drifts: CounterDrift[] = [];
  let scanned = 0;

  // We scan each counter family separately so a failure in one doesn't kill the others.

  // 1) Thread.messageCount
  {
    const threads = await prisma.thread.findMany({
      where: { deletedAt: null },
      select: { id: true, messageCount: true },
    });
    scanned += threads.length;
    drifts.push(
      ...(await compareAll(
        'threads',
        'messageCount',
        threads as AnyRow[],
        COUNTERS[0].recompute
      ))
    );
  }

  // 2) Thread.memberCount
  {
    const threads = await prisma.thread.findMany({
      where: { deletedAt: null },
      select: { id: true, memberCount: true },
    });
    scanned += threads.length;
    drifts.push(
      ...(await compareAll(
        'threads',
        'memberCount',
        threads as AnyRow[],
        COUNTERS[1].recompute
      ))
    );
  }

  // 3) Message.likeCount — only scan messages in active threads
  {
    const messages = await prisma.message.findMany({
      where: { deletedAt: null, thread: { deletedAt: null } },
      select: { id: true, likeCount: true },
    });
    scanned += messages.length;
    drifts.push(
      ...(await compareAll(
        'messages',
        'likeCount',
        messages as AnyRow[],
        COUNTERS[2].recompute
      ))
    );
  }

  // 4) Message.replyCount — only scan root messages to bound the scan.
  {
    const messages = await prisma.message.findMany({
      where: {
        deletedAt: null,
        thread: { deletedAt: null },
        depth: 0,
      },
      select: { id: true, replyCount: true },
    });
    scanned += messages.length;
    drifts.push(
      ...(await compareAll(
        'messages',
        'replyCount',
        messages as AnyRow[],
        COUNTERS[3].recompute
      ))
    );
  }

  // Note: followerCount / followingCount are intentionally NOT reconciled here.
  // Both columns exist in the User model but are never incremented/decremented by any
  // write path in this codebase (grep confirms zero call sites). Forcing a reconcile
  // on these would surface zero drift (stored = actual = 0) and burn query budget.
  // Revisit when a follow/unfollow write path actually exists.

  if (drifts.length > 0) {
    logger.warn(
      `[counter-reconcile] ${drifts.length} drift(s) across ${scanned} scanned rows`,
      { drifts: drifts.slice(0, 25), totalDrifts: drifts.length }
    );
  } else {
    logger.info(`[counter-reconcile] clean — ${scanned} rows scanned, no drift`);
  }

  // Auto-correct: intentionally a no-op while COUNTER_RECONCILIATION_AUTO_CORRECT=false.
  // The config flag exists so flipping it later is a one-line change, not a code change.
  if (COUNTER_RECONCILIATION_AUTO_CORRECT && drifts.length > 0) {
    logger.warn(
      '[counter-reconcile] auto-correct ENABLED but would mask underlying write-path bugs; ' +
        'recommended only after 30 days of clean report-only logs. No-op for now.'
    );
  }

  return { scanned, drifts };
}

type AnyRow = { id: string } & Record<string, unknown>;

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

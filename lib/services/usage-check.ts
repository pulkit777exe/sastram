import { getUpstashRedis, ATOMIC_INCR_EXPIRE_LUA, getSecondsUntilUtcMidnight } from '@/lib/infrastructure/redis-upstash';
import { logger } from '@/lib/infrastructure/logger';

/**
 * Best-effort tripwire for free-tier budgets, not a hard guarantee.
 *
 * Neon: 100 CU-hours/month (~3.3/day). At ~2s per DB-heavy request that's
 * roughly 4,800 requests/day at the 80% mark. Free tier has no usage API, so
 * this is an estimate from our own request count.
 *
 * Upstash: 500K commands/month (~16,666/day). We count our own calls, which
 * won't exactly match Upstash's internal tally.
 */
const NEON_DAILY_BUDGET = 4800;
const UPSTASH_DAILY_BUDGET = 13_333;
const WARN_THRESHOLD = 0.8;

function getDailyKey(prefix: string): string {
  const d = new Date();
  return `usage:${prefix}:${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Tracking must never break the request it's measuring, so errors are swallowed.
// Increments by one per call — ATOMIC_INCR_EXPIRE_LUA has no batch-count argument.
async function track(prefix: string): Promise<void> {
  const redis = getUpstashRedis();
  if (!redis) return;
  try {
    const ttl = getSecondsUntilUtcMidnight();
    await redis.eval(ATOMIC_INCR_EXPIRE_LUA, [getDailyKey(prefix)], [String(ttl)]);
  } catch {
    return;
  }
}

/** Call from API routes that cause DB queries. */
export async function trackNeonRequest(): Promise<void> {
  return track('neon');
}

export async function trackUpstashCommand(): Promise<void> {
  return track('upstash');
}

/** Null when Redis is unavailable. */
export async function getDailyUsage(): Promise<{
  neonRequests: number;
  upstashCommands: number;
  qstashMessages: number;
} | null> {
  const redis = getUpstashRedis();
  if (!redis) return null;

  try {
    const [neonKey, upstashKey] = [getDailyKey('neon'), getDailyKey('upstash')];
    const [neonRequests, upstashCommands] = await Promise.all([
      redis.get<number>(neonKey).then((v) => v ?? 0),
      redis.get<number>(upstashKey).then((v) => v ?? 0),
    ]);

    // Deferred import: queue.ts imports back into this module.
    const { getDailyQstashCount } = await import('@/lib/services/queue');
    const qstashMessages = await getDailyQstashCount();

    return { neonRequests, upstashCommands, qstashMessages };
  } catch {
    return null;
  }
}

/** Run from the daily cron. Warns only — never blocks anything. */
export async function checkAndLogUsage(): Promise<void> {
  const usage = await getDailyUsage();
  if (!usage) {
    logger.warn('[usage-check] Redis unavailable — cannot check usage metrics');
    return;
  }

  const neonRatio = usage.neonRequests / NEON_DAILY_BUDGET;
  const upstashRatio = usage.upstashCommands / UPSTASH_DAILY_BUDGET;

  if (neonRatio >= WARN_THRESHOLD) {
    logger.warn(
      `[usage-check] Neon request count (${usage.neonRequests}) at ${Math.round(neonRatio * 100)}% of daily budget (${NEON_DAILY_BUDGET}). ` +
      `Estimated CU-hour usage approaching limit. This is a best-effort estimate — Neon free tier has no usage API.`
    );
  }

  if (upstashRatio >= WARN_THRESHOLD) {
    logger.warn(
      `[usage-check] Upstash command count (${usage.upstashCommands}) at ${Math.round(upstashRatio * 100)}% of daily budget (${UPSTASH_DAILY_BUDGET}). ` +
      `This tracks our Redis calls, not Upstash's internal counting.`
    );
  }

  if (usage.qstashMessages > 800) {
    logger.warn(
      `[usage-check] QStash daily count (${usage.qstashMessages}) approaching 1,000/day free tier limit.`
    );
  }

  logger.info(
    `[usage-check] Daily usage: neon=${usage.neonRequests}/${NEON_DAILY_BUDGET} requests, ` +
    `upstash=${usage.upstashCommands}/${UPSTASH_DAILY_BUDGET} commands, ` +
    `qstash=${usage.qstashMessages}/1000 messages`
  );
}

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
const NEON_DAILY_BUDGET = 4800; // estimated Neon CU-hour budget in requests/day
const UPSTASH_DAILY_BUDGET = 13_333; // 80% of 500K /30 free tier
const WARN_THRESHOLD = 0.8; // warn at 80% of budget
const QSTASH_DAILY_WARNING_THRESHOLD = 800; // 80% of 1000/day free tier
const MIN_TTL_SECONDS = 60; // safety floor for midnight expiry

function getDailyKey(usagePrefix: string): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `usage:${usagePrefix}:${year}-${month}-${day}`;
}

// Tracking must never break the request it's measuring, so errors are swallowed.
// Increments by one per call — ATOMIC_INCR_EXPIRE_LUA has no batch-count argument.
async function track(usagePrefix: string): Promise<void> {
  const redis = getUpstashRedis();
  if (redis === null || redis === undefined) return;
  try {
    const ttlSeconds = getSecondsUntilUtcMidnight();
    const safeTtl = Math.max(MIN_TTL_SECONDS, ttlSeconds);
    await redis.eval(ATOMIC_INCR_EXPIRE_LUA, [getDailyKey(usagePrefix)], [String(safeTtl)]);
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
  if (redis === null || redis === undefined) return null;

  try {
    const neonKey = getDailyKey('neon');
    const upstashKey = getDailyKey('upstash');
    const [neonRequests, upstashCommands] = await Promise.all([
      redis.get<number>(neonKey).then((storedValue) => storedValue ?? 0),
      redis.get<number>(upstashKey).then((storedValue) => storedValue ?? 0),
    ]);

    // Deferred import: queue.ts imports back into this module.
    const { getDailyQstashCount } = await import('@/lib/services/queue');
    const qstashMessages = await getDailyQstashCount();

    return { neonRequests, upstashCommands, qstashMessages };
  } catch {
    return null;
  }
}

function logNeonWarningIfNeeded(neonRequests: number): void {
  const neonRatio = neonRequests / NEON_DAILY_BUDGET;
  if (neonRatio < WARN_THRESHOLD) return;
  logger.warn(
    `[usage-check] Neon request count (${neonRequests}) at ${Math.round(neonRatio * 100)}% of daily budget (${NEON_DAILY_BUDGET}). ` +
    `Estimated CU-hour usage approaching limit. This is a best-effort estimate — Neon free tier has no usage API.`
  );
}

function logUpstashWarningIfNeeded(upstashCommands: number): void {
  const upstashRatio = upstashCommands / UPSTASH_DAILY_BUDGET;
  if (upstashRatio < WARN_THRESHOLD) return;
  logger.warn(
    `[usage-check] Upstash command count (${upstashCommands}) at ${Math.round(upstashRatio * 100)}% of daily budget (${UPSTASH_DAILY_BUDGET}). ` +
    `This tracks our Redis calls, not Upstash's internal counting.`
  );
}

function logQstashWarningIfNeeded(qstashMessages: number): void {
  if (qstashMessages <= QSTASH_DAILY_WARNING_THRESHOLD) return;
  logger.warn(
    `[usage-check] QStash daily count (${qstashMessages}) approaching 1,000/day free tier limit.`
  );
}

/** Run from the daily cron. Warns only — never blocks anything. */
export async function checkAndLogUsage(): Promise<void> {
  const usage = await getDailyUsage();
  if (usage === null || usage === undefined) {
    logger.warn('[usage-check] Redis unavailable — cannot check usage metrics');
    return;
  }

  logNeonWarningIfNeeded(usage.neonRequests);
  logUpstashWarningIfNeeded(usage.upstashCommands);
  logQstashWarningIfNeeded(usage.qstashMessages);

  logger.info(
    `[usage-check] Daily usage: neon=${usage.neonRequests}/${NEON_DAILY_BUDGET} requests, ` +
    `upstash=${usage.upstashCommands}/${UPSTASH_DAILY_BUDGET} commands, ` +
    `qstash=${usage.qstashMessages}/1000 messages`
  );
}

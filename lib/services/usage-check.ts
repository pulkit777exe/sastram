import { getUpstashRedis, ATOMIC_INCR_EXPIRE_LUA, getSecondsUntilUtcMidnight } from '@/lib/infrastructure/redis-upstash';
import { logger } from '@/lib/infrastructure/logger';

/**
 * Internal budget limits (conservative, best-effort tripwire).
 * These are NOT hard guarantees — just early warnings.
 *
 * Neon free tier: 100 CU-hours/month (~3.3 CU-hours/day)
 *   - Each serverless function invocation ≈ 1 CU-second minimum
 *   - 80% threshold = ~2.6 CU-hours/day = ~9,600 CU-seconds/day
 *   - We estimate ~2s per DB-heavy request, so ~4,800 requests/day budget
 *
 * Upstash Redis free: 500K commands/month (~16,666/day)
 *   - 80% threshold = ~13,333 commands/day
 *   - This counter tracks our own Redis commands, not Upstash's internal counting
 */
const NEON_DAILY_BUDGET = 4800; // estimated requests/day at 80% of CU-hour budget
const UPSTASH_DAILY_BUDGET = 13_333; // 80% of 16,666/day
const WARN_THRESHOLD = 0.8; //80%

function getDailyKey(prefix: string): string {
  const d = new Date();
  return `usage:${prefix}:${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Increment the daily Neon request counter.
 * Call this from key API routes that cause DB queries.
 */
export async function trackNeonRequest(count: number = 1): Promise<void> {
  const redis = getUpstashRedis();
  if (!redis) return;
  try {
    const key = getDailyKey('neon');
    const ttl = getSecondsUntilUtcMidnight();
    await redis.eval(ATOMIC_INCR_EXPIRE_LUA, [key], [String(ttl), String(count)]);
  } catch {
    // Best-effort — don't break requests if tracking fails
  }
}

/**
 * Increment the daily Upstash Redis command counter.
 * Call this from key operations that use Redis.
 */
export async function trackUpstashCommand(count: number =1): Promise<void> {
  const redis = getUpstashRedis();
  if (!redis) return;
  try {
    const key = getDailyKey('upstash');
    const ttl = getSecondsUntilUtcMidnight();
    await redis.eval(ATOMIC_INCR_EXPIRE_LUA, [key], [String(ttl), String(count)]);
  } catch {
    // Best-effort
  }
}

/**
 * Get current daily usage counts.
 * Returns null if Redis is unavailable.
 */
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

    // Import here to avoid circular dependency
    const { getDailyQstashCount } = await import('@/lib/services/queue');
    const qstashMessages = await getDailyQstashCount();

    return { neonRequests, upstashCommands, qstashMessages };
  } catch {
    return null;
  }
}

/**
 * Check usage and log warnings if approaching limits.
 * Call this from the daily cron job.
 *
 * IMPORTANT: This is a best-effort tripwire, not a hard guarantee.
 * - Neon CU-hours are estimated, not exact (no API on free tier)
 * - Upstash command count tracks our calls, not their internal counting
 * - QStash count is accurate (we track it ourselves)
 */
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

  // Log summary at info level for monitoring
  logger.info(
    `[usage-check] Daily usage: neon=${usage.neonRequests}/${NEON_DAILY_BUDGET} requests, ` +
    `upstash=${usage.upstashCommands}/${UPSTASH_DAILY_BUDGET} commands, ` +
    `qstash=${usage.qstashMessages}/1000 messages`
  );
}

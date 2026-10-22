import { Client } from '@upstash/qstash';
import { env } from '@/lib/config/env';
import { logger } from '@/lib/infrastructure/logger';
import { AIJobType } from '@/lib/queue/config';
import { getUpstashRedis, ATOMIC_INCR_EXPIRE_LUA, getSecondsUntilUtcMidnight, withRedisTimeout } from '@/lib/infrastructure/redis-upstash';
import type { AIInlineJobData } from '@/lib/queue/types';

// QSTASH_DEV points the SDK at a local dev server (127.0.0.1:8080) that does
// not reliably deliver jobs to a local Next.js app. In dev mode, run jobs
// inline (degraded mode) so summaries and @sai replies complete synchronously
// and the client-side polling loops terminate.

function isDevMode(): boolean {
  return env.QSTASH_DEV;
}

function hasQstashCredentials(): boolean {
  const token = env.QSTASH_TOKEN;
  const url = env.QSTASH_URL;
  if (token && url) {
    return true;
  }
  return false;
}

function isQstashConfigured(): boolean {
  // Dev mode disables QStash even if credentials exist.
  if (isDevMode()) {
    return false;
  }
  if (hasQstashCredentials()) {
    return true;
  }
  return false;
}

let client: Client | null = null;

function getQstashClient(): Client | null {
  if (!isQstashConfigured()) return null;
  if (client) return client;
  try {
    const token = env.QSTASH_TOKEN as string;
    const baseUrl = env.QSTASH_URL as string;
    client = new Client({ token, baseUrl });
  } catch (error) {
    logger.error(
      '[queue] QSTASH_URL or QSTASH_TOKEN is invalid — Client initialization failed. All jobs will run inline in degraded mode.',
      error,
    );
    return null;
  }
  return client;
}

function shouldRunInline(): boolean {
  if (!isQstashConfigured()) {
    return true;
  }
  if (!getQstashClient()) {
    return true;
  }
  return false;
}

// Default is well under QStash's 1,000/day free tier — the rest is headroom
// for retries. Paid deployments can raise QSTASH_DAILY_CAP.
const CRITICAL_JOBS = new Set<string>(['email']);

/**
 * How an enqueue attempt was handled:
 * - `inline`    — ran immediately (QStash not configured — degraded mode).
 * - `published` — handed to QStash.
 * - `dropped`   — never ran: daily cap reached (non-critical only) or no inline handler.
 */
export type EnqueueJobStatus = 'inline' | 'published' | 'dropped';

export interface EnqueueJobResult {
  status: EnqueueJobStatus;
  /** True when the job ran inline or was published; false when it was dropped. */
  ok: boolean;
}

function getRetries(jobType: string): number {
  if (CRITICAL_JOBS.has(jobType)) return 3;
  return 1;
}

function getDailyCounterKey(): string {
  const d = new Date();
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  // Explicit named parts instead of inline template with ternaries.
  const datePart = `${year}-${month}-${day}`;
  return `qstash:daily:${datePart}`;
}

export async function getDailyQstashCount(): Promise<number> {
  const redis = getUpstashRedis();
  if (!redis) {
    // No Redis — treat as zero count (fail open for quota).
    return 0;
  }
  try {
    const count = await withRedisTimeout(redis.get<number>(getDailyCounterKey()), 4000);
    // Explicit branch instead of `?? 0` fallback.
    if (count !== null && count !== undefined) {
      return count;
    }
    return 0;
  } catch {
    return 0;
  }
}

export async function incrementDailyQstashCount(): Promise<number> {
  const redis = getUpstashRedis();
  if (!redis) return 0;
  try {
    const ttl = getSecondsUntilUtcMidnight();
    return (await withRedisTimeout(redis.eval(ATOMIC_INCR_EXPIRE_LUA, [getDailyCounterKey()], [ttl]) as Promise<number>, 4000)) as number;
  } catch (error) {
    logger.error('[queue] Failed to increment daily QStash counter', error);
    return 0;
  }
}

export async function enqueueJob<T extends object>(jobType: string, payload: T): Promise<EnqueueJobResult> {
  // Early return: run inline when QStash isn't configured.
  if (shouldRunInline()) {
    logger.info(`[queue] QStash not configured, running job inline: ${jobType}`);
    const ran = await runJobInline(jobType, payload);
    return { status: ran ? 'inline' : 'dropped', ok: ran };
  }

  const count = await incrementDailyQstashCount();
  const dailyCap = env.QSTASH_DAILY_CAP ?? 450;

  // CRITICAL_JOBS (email — carries OTP sign-in codes) are never dropped by the
  // daily cap: failing to deliver a sign-in code is a user-facing outage, while
  // the cap only protects QStash's free allowance. They are still counted above
  // so the daily guard threshold sees them.
  if (count > dailyCap && !CRITICAL_JOBS.has(jobType)) {
    logger.error(
      `[queue] DROPPED job — daily QStash cap (${dailyCap}) reached, skipping: ${jobType} (count=${count})`
    );
    return { status: 'dropped', ok: false };
  }

  logger.info(`[queue] Enqueuing job: ${jobType} (daily count: ${count})`);
  try {
    const retries = getRetries(jobType);
    const url = `${env.NEXT_PUBLIC_APP_URL}/api/jobs`;
    const body = { jobType, payload };
    const qstashClient = getQstashClient();
    const publish = qstashClient!.publishJSON({
      url,
      body,
      retries,
      deduplicationId: `${jobType}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    });
    await Promise.race([
      publish,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('QStash publish timeout')), 10000)),
    ]);
    return { status: 'published', ok: true };
  } catch (error) {
    logger.error(`[queue] QStash publish failed for ${jobType}`, error);
    throw error;
  }
}

async function runJobInline<T extends object>(jobType: string, payload: T): Promise<boolean> {
  try {
    // Deferred import to break circular: registry -> workers -> enqueueJob -> registry
    const { jobHandlers } = await import('@/lib/queue/registry');

    const handler = jobHandlers[jobType as keyof typeof jobHandlers];
    if (!handler) {
      const payloadWithId = payload as { id?: unknown };
      const loggedId = String(payloadWithId?.id ?? 'unknown');
      logger.error(`[queue] DROPPED job — no inline handler for job type: ${jobType}, payload id: ${loggedId}`);
      return false;
    }

    await handler(payload as never);
    return true;
  } catch (error) {
    logger.error(`[queue] Inline job execution failed: ${jobType}`, error);
    return false;
  }
}

export async function enqueueInlineJob(data: AIInlineJobData): Promise<EnqueueJobResult> {
  return enqueueJob(AIJobType.GENERATE_AI_INLINE, data);
}

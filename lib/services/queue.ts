import { Client } from '@upstash/qstash';
import { logger } from '@/lib/infrastructure/logger';
import { AIJobType } from '@/lib/queue/config';
import { getUpstashRedis, ATOMIC_INCR_EXPIRE_LUA, getSecondsUntilUtcMidnight } from '@/lib/infrastructure/redis-upstash';
import type { AIInlineJobData } from '@/lib/queue/types';

// QSTASH_DEV points the SDK at a local dev server (127.0.0.1:8080) that does
// not reliably deliver jobs to a local Next.js app. In dev mode, run jobs
// inline (degraded mode) so summaries and @sai replies complete synchronously
// and the client-side polling loops terminate.

function isDevMode(): boolean {
  // Explicit branch instead of inline comparison.
  const raw = process.env.QSTASH_DEV;
  if (raw === 'true') {
    return true;
  }
  return false;
}

function hasQstashCredentials(): boolean {
  const token = process.env.QSTASH_TOKEN;
  const url = process.env.QSTASH_URL;
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
    const token = process.env.QSTASH_TOKEN as string;
    const baseUrl = process.env.QSTASH_URL as string;
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

// Well under QStash's 1,000/day free tier — the rest is headroom for retries.
const DAILY_CAP = 450;
const CRITICAL_JOBS = new Set<string>(['email']);

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
    const count = await redis.get<number>(getDailyCounterKey());
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
    return (await redis.eval(ATOMIC_INCR_EXPIRE_LUA, [getDailyCounterKey()], [ttl])) as number;
  } catch (error) {
    logger.error('[queue] Failed to increment daily QStash counter', error);
    return 0;
  }
}

export async function enqueueJob<T extends object>(jobType: string, payload: T) {
  // Early return: run inline when QStash isn't configured.
  if (shouldRunInline()) {
    logger.info(`[queue] QStash not configured, running job inline: ${jobType}`);
    await runJobInline(jobType, payload);
    return;
  }

  const count = await incrementDailyQstashCount();

  // Early return: daily cap reached — skip enqueue.
  if (count > DAILY_CAP) {
    logger.warn(`[queue] Daily QStash cap (${DAILY_CAP}) reached, skipping job: ${jobType} (count=${count})`);
    return;
  }

  logger.info(`[queue] Enqueuing job: ${jobType} (daily count: ${count})`);
  try {
    const retries = getRetries(jobType);
    const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/jobs`;
    const body = { jobType, payload };
    const qstashClient = getQstashClient();
    await qstashClient!.publishJSON({
      url,
      body,
      retries,
    });
  } catch (error) {
    logger.error(`[queue] QStash publish failed for ${jobType}`, error);
    throw error;
  }
}

async function runJobInline<T extends object>(jobType: string, payload: T) {
  try {
    // Deferred import to break circular: registry -> workers -> enqueueJob -> registry
    const { jobHandlers } = await import('@/lib/queue/registry');

    const handler = jobHandlers[jobType as keyof typeof jobHandlers];
    if (!handler) {
      const payloadWithId = payload as { id?: unknown };
      const loggedId = String(payloadWithId?.id ?? 'unknown');
      logger.error(`[queue] DROPPED job — no inline handler for job type: ${jobType}, payload id: ${loggedId}`);
      return;
    }

    await handler(payload as never);
  } catch (error) {
    logger.error(`[queue] Inline job execution failed: ${jobType}`, error);
  }
}

export async function enqueueInlineJob(data: AIInlineJobData) {
  await enqueueJob(AIJobType.GENERATE_AI_INLINE, data);
}

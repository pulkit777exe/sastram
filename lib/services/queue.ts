import { Client } from '@upstash/qstash';
import { logger } from '@/lib/infrastructure/logger';
import { AIJobType } from '@/lib/queue/config';
import { getUpstashRedis, ATOMIC_INCR_EXPIRE_LUA, getSecondsUntilUtcMidnight } from '@/lib/infrastructure/redis-upstash';
import type { AIInlineJobData } from '@/lib/queue/types';

// QSTASH_DEV points the SDK at a local dev server (127.0.0.1:8080) that does
// not reliably deliver jobs to a local Next.js app. In dev mode, run jobs
// inline (degraded mode) so summaries and @sai replies complete synchronously
// and the client-side polling loops terminate.
const QSTASH_DEV = process.env.QSTASH_DEV === 'true';
const QSTASH_CONFIGURED = !QSTASH_DEV && !!(process.env.QSTASH_TOKEN && process.env.QSTASH_URL);
let client: Client | null = null;
if (QSTASH_CONFIGURED) {
  try {
    client = new Client({
      token: process.env.QSTASH_TOKEN!,
      baseUrl: process.env.QSTASH_URL!,
    });
  } catch (error) {
    logger.error(
      '[queue] QSTASH_URL or QSTASH_TOKEN is invalid — Client initialization failed. All jobs will run inline in degraded mode.',
      error,
    );
  }
}

// Well under QStash's 1,000/day free tier — the rest is headroom for retries.
const DAILY_CAP = 450;
const CRITICAL_JOBS = new Set<string>(['email']);

function getRetries(jobType: string): number {
  return CRITICAL_JOBS.has(jobType) ? 3 : 1;
}

function getDailyCounterKey(): string {
  const d = new Date();
  return `qstash:daily:${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export async function getDailyQstashCount(): Promise<number> {
  const redis = getUpstashRedis();
  if (!redis) return 0;
  try {
    const count = await redis.get<number>(getDailyCounterKey());
    return count ?? 0;
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
  // Local dev fallback: run inline when QStash isn't configured.
  if (!QSTASH_CONFIGURED || !client) {
    logger.info(`[queue] QStash not configured, running job inline: ${jobType}`);
    await runJobInline(jobType, payload);
    return;
  }

  const count = await incrementDailyQstashCount();
  if (count > DAILY_CAP) {
    logger.warn(`[queue] Daily QStash cap (${DAILY_CAP}) reached, skipping job: ${jobType} (count=${count})`);
    return;
  }

  logger.info(`[queue] Enqueuing job: ${jobType} (daily count: ${count})`);
  try {
    await client.publishJSON({
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/jobs`,
      body: { jobType, payload },
      retries: getRetries(jobType),
    });
  } catch (error) {
    logger.error(`[queue] QStash publish failed for ${jobType}`, error);
    throw error;
  }
}

async function runJobInline<T extends object>(jobType: string, payload: T) {
  try {
    // Deferred imports: the workers import back into this module.
    const ai = await import('@/lib/queue/workers');
    const { handleEmailJob } = await import('@/lib/queue/workers/email.worker');

    const handlers: Record<string, (data: never) => Promise<unknown>> = {
      [AIJobType.GENERATE_THREAD_SUMMARY]: ai.handleThreadSummaryJob,
      [AIJobType.GENERATE_THREAD_DNA]: ai.handleThreadDnaJob,
      [AIJobType.CALCULATE_RESOLUTION_SCORE]: ai.handleResolutionScoreJob,
      [AIJobType.DETECT_CONFLICTS]: ai.handleConflictDetectionJob,
      [AIJobType.GENERATE_DAILY_DIGEST]: ai.handleDailyDigestJob,
      [AIJobType.SEND_AI_INSIGHT_NOTIFICATIONS]: ai.handleAIInsightNotificationsJob,
      [AIJobType.STALENESS_CHECK]: ai.handleStalenessCheckJob,
      [AIJobType.GENERATE_AI_INLINE]: ai.handleAIInlineJob,
      email: handleEmailJob,
    };

    const handler = handlers[jobType];
    if (!handler) {
      const id = (payload as { id?: unknown })?.id;
      logger.error(`[queue] DROPPED job — no inline handler for job type: ${jobType}, payload id: ${id ?? 'unknown'}`);
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

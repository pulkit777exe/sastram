import { Client } from '@upstash/qstash';
import { logger } from '@/lib/infrastructure/logger';
import { AIJobType } from '@/lib/queue/config';
import { getUpstashRedis, ATOMIC_INCR_EXPIRE_LUA, getSecondsUntilUtcMidnight } from '@/lib/infrastructure/redis-upstash';
import type { AIInlineJobData } from '@/lib/queue/types';

const QSTASH_CONFIGURED = !!(process.env.QSTASH_TOKEN && process.env.QSTASH_URL);
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
    const key = getDailyCounterKey();
    const ttl = getSecondsUntilUtcMidnight();
    const count = (await redis.eval(ATOMIC_INCR_EXPIRE_LUA, [key], [ttl])) as number;
    return count;
  } catch (error) {
    logger.error('[queue] Failed to increment daily QStash counter', error);
    return 0;
  }
}

export async function enqueueJob(jobType: string, payload: Record<string, unknown>) {
  // Local dev fallback: run job inline when QStash is not configured
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

async function runJobInline(jobType: string, payload: Record<string, unknown>) {
  try {
    // Dynamic import to avoid circular dependencies
    const { handleAIInlineJob } = await import('@/lib/queue/workers/ai.worker');
    const { handleEmailJob } = await import('@/lib/queue/workers/email.worker');

    switch (jobType) {
      case AIJobType.GENERATE_AI_INLINE:
        await handleAIInlineJob(payload as unknown as AIInlineJobData);
        break;
      case 'email':
        await handleEmailJob(payload as unknown as import('@/lib/queue/types').EmailJobData);
        break;
      default:
        logger.error(`[queue] DROPPED job — no inline handler for job type: ${jobType}, payload id: ${(payload as Record<string, unknown>)?.id ?? 'unknown'}`);
    }
  } catch (error) {
    logger.error(`[queue] Inline job execution failed: ${jobType}`, error);
  }
}

export async function enqueueInlineJob(data: AIInlineJobData) {
  await enqueueJob(AIJobType.GENERATE_AI_INLINE, data as unknown as Record<string, unknown>);
}

import { getUpstashRedis } from '@/lib/infrastructure/redis-upstash';

const DEFAULT_JOB_DEDUP_TTL_SECONDS = 3600; // 1 hour — covers QStash retry window

/** Returns true if the job should run, false if it's a duplicate delivery. */
export async function deduplicateJob(jobId: string, ttlSeconds: number = DEFAULT_JOB_DEDUP_TTL_SECONDS): Promise<boolean> {
  const redis = getUpstashRedis();
  // No Redis means no dedup — better to risk a double-run than drop the job.
  if (redis === null || redis === undefined) return true;

  const setResult = await redis.set(`job:dedup:${jobId}`, '1', { ex: ttlSeconds, nx: true });
  return setResult === 'OK';
}

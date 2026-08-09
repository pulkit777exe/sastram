import { getUpstashRedis } from '@/lib/infrastructure/redis-upstash';

/** Returns true if the job should run, false if it's a duplicate delivery. */
export async function deduplicateJob(jobId: string, ttlSeconds: number = 3600): Promise<boolean> {
  const redis = getUpstashRedis();
  // No Redis means no dedup — better to risk a double-run than drop the job.
  if (!redis) return true;

  const result = await redis.set(`job:dedup:${jobId}`, '1', { ex: ttlSeconds, nx: true });
  return result === 'OK';
}

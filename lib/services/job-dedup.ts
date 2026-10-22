import {
  claimOnce,
  completeOnce,
  releaseOnce,
  JOB_DEDUP_TTL_SECONDS,
  JOB_PROCESSING_LEASE_SECONDS,
} from '@/lib/services/idempotency';

/** Namespaced job key — keeps QStash dedup rows off the request-claim space. */
export function jobDedupKey(jobId: string): string {
  return `job:dedup:${jobId}`;
}

/**
 * Adapter over the shared exactly-once seam (`claimOnce`): job scope with a
 * namespaced key. Returns true if the job should run, false on redelivery.
 *
 * Fail-open like the rest of the seam (was: Redis errors threw and the jobs
 * route 500'd, dropping redeliveries that QStash would otherwise retry).
 */
export async function deduplicateJob(
  jobId: string,
  ttlSeconds: number = JOB_PROCESSING_LEASE_SECONDS
): Promise<boolean> {
  return claimOnce(jobDedupKey(jobId), 'job', ttlSeconds);
}

/**
 * Mark a finished job as completed for the full dedup window. Call only after
 * the handler succeeds (or terminally rejects); a killed process intentionally
 * leaves the short lease to expire so QStash can retry.
 */
export async function completeJobDedup(jobId: string): Promise<boolean> {
  return completeOnce(jobDedupKey(jobId), JOB_DEDUP_TTL_SECONDS);
}

/**
 * Release the dedup claim after a retryable handler failure so QStash's retry
 * executes instead of being swallowed as `{duplicate: true}`. Terminal
 * (AppError) failures keep the claim — they must not be retried.
 */
export async function releaseJobDedup(jobId: string): Promise<boolean> {
  return releaseOnce(jobDedupKey(jobId), 'job');
}

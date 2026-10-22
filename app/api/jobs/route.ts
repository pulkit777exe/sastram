import { NextRequest, NextResponse } from 'next/server';
import { HTTP_STATUS } from '@/lib/utils/api-response';
import { Receiver } from '@upstash/qstash';
import { logger } from '@/lib/infrastructure/logger';
import { completeJobDedup, deduplicateJob, releaseJobDedup } from '@/lib/services/job-dedup';
import { jobHandlers, type JobHandlerMap } from '@/lib/queue/registry';
import { AppError } from '@/lib/utils/errors';

export const maxDuration = 60;

async function handleJob(body: string, request: NextRequest) {
  const messageId = request.headers.get('upstash-message-id');
  if (messageId) {
    // deduplicateJob returns true when the job should run (first delivery).
    const shouldRun = await deduplicateJob(messageId);
    if (!shouldRun) {
      logger.info(`[jobs] Duplicate job ${messageId}, skipping`);
      return NextResponse.json({ ok: true, duplicate: true });
    }
  }

  let parsed: { jobType: keyof JobHandlerMap; payload: Record<string, unknown> };
  try {
    parsed = JSON.parse(body);
  } catch {
    if (messageId) await completeJobDedup(messageId);
    return NextResponse.json({ error: 'Invalid JSON' }, { status: HTTP_STATUS.BAD_REQUEST });
  }

  const { jobType, payload } = parsed;

  const handler = jobHandlers[jobType];
  if (!handler) {
    logger.warn(`[jobs] Unknown job type: ${jobType}`);
    if (messageId) await completeJobDedup(messageId);
    return NextResponse.json({ error: `Unknown job type: ${jobType}` }, { status: HTTP_STATUS.BAD_REQUEST });
  }

  try {
    logger.info(`[jobs] Processing job: ${jobType}`);
    await handler(payload as never);
    // Upgrade the short processing lease to a full completed marker only now;
    // a crash before this point lets QStash redeliver after the lease expires.
    if (messageId) await completeJobDedup(messageId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (AppError.isAppError(error)) {
      // Terminal — mark completed so a redelivery is not re-run.
      logger.warn(`[jobs] Job ${jobType} failed (non-retryable): ${error.message}`);
      if (messageId) await completeJobDedup(messageId);
      return NextResponse.json({ ok: true, error: error.message });
    }
    // Retryable — release the claim before the 500 so QStash's retry
    // re-executes instead of being absorbed as a duplicate delivery.
    if (messageId) {
      await releaseJobDedup(messageId);
    }
    logger.error(`[jobs] Job ${jobType} failed:`, error);
    return NextResponse.json({ error: 'Job failed' }, { status: HTTP_STATUS.INTERNAL });
  }
}

// Verify the QStash signature at request time. The Receiver is constructed
// lazily so that the route can be imported (e.g. during `next build` page-data
// collection) even when QSTASH signing keys are not present in the environment.
async function verifyQstashSignature(
  request: NextRequest,
  rawBody: string
): Promise<boolean> {
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  // No keys configured: fail-closed in production, skip in dev/build.
  if (!currentKey) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('[jobs] QSTASH_CURRENT_SIGNING_KEY missing in production — rejecting');
      return false;
    }
    return true;
  }

  try {
    const receiver = new Receiver({
      currentSigningKey: currentKey,
      nextSigningKey: nextKey ?? currentKey,
    });

    const signature = request.headers.get('upstash-signature');
    if (!signature) {
      return false;
    }

    return await receiver.verify({
      signature,
      body: rawBody,
    });
  } catch (error) {
    logger.error('[jobs] Signature verification failed:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  const body = await request.text();

  const isValid = await verifyQstashSignature(request, body);
  if (!isValid) {
    logger.warn('[jobs] Invalid or missing QStash signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: HTTP_STATUS.UNAUTHORIZED });
  }

  return handleJob(body, request);
}

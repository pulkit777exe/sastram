import { NextRequest, NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { logger } from '@/lib/infrastructure/logger';
import { deduplicateJob } from '@/lib/services/job-dedup';
import { jobHandlers, type JobHandlerMap } from '@/lib/queue/registry';
import { AppError } from '@/lib/utils/errors';

export const maxDuration = 60;

async function handleJob(body: string, request: NextRequest) {
  const messageId = request.headers.get('upstash-message-id');
  if (messageId) {
    const isDuplicate = await deduplicateJob(messageId);
    if (!isDuplicate) {
      logger.info(`[jobs] Duplicate job ${messageId}, skipping`);
      return NextResponse.json({ ok: true, duplicate: true });
    }
  }

  let parsed: { jobType: keyof JobHandlerMap; payload: Record<string, unknown> };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { jobType, payload } = parsed;

  const handler = jobHandlers[jobType];
  if (!handler) {
    logger.warn(`[jobs] Unknown job type: ${jobType}`);
    return NextResponse.json({ error: `Unknown job type: ${jobType}` }, { status: 400 });
  }

  try {
    logger.info(`[jobs] Processing job: ${jobType}`);
    await handler(payload as never);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (AppError.isAppError(error)) {
      logger.warn(`[jobs] Job ${jobType} failed (non-retryable): ${error.message}`);
      return NextResponse.json({ ok: true, error: error.message });
    }
    logger.error(`[jobs] Job ${jobType} failed:`, error);
    return NextResponse.json({ error: 'Job failed' }, { status: 500 });
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

  // No keys configured (build-time collection, local dev without QStash): skip verification.
  if (!currentKey) {
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
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  return handleJob(body, request);
}

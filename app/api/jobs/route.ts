import { NextRequest, NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { logger } from '@/lib/infrastructure/logger';
import { deduplicateJob } from '@/lib/services/job-dedup';
import {
  handleThreadSummaryJob,
  handleThreadDnaJob,
  handleResolutionScoreJob,
  handleConflictDetectionJob,
  handleDailyDigestJob,
  handleAIInsightNotificationsJob,
  handleAIInlineJob,
  handleStalenessCheckJob,
} from '@/lib/queue/workers/ai.worker';
import { handleEmailJob } from '@/lib/queue/workers/email.worker';
import type {
  ThreadSummaryJobData,
  ThreadDnaJobData,
  ResolutionScoreJobData,
  ConflictDetectionJobData,
  DailyDigestJobData,
  AIInsightNotificationJobData,
  AIInlineJobData,
  StalenessCheckJobData,
  EmailJobData,
} from '@/lib/queue/types';

export const maxDuration = 60;

const isDev = process.env.NODE_ENV !== 'production';

const jobHandlers: Record<string, (data: unknown) => Promise<unknown>> = {
  'generate-thread-summary': (data) => handleThreadSummaryJob(data as ThreadSummaryJobData),
  'generate-thread-dna': (data) => handleThreadDnaJob(data as ThreadDnaJobData),
  'calculate-resolution-score': (data) => handleResolutionScoreJob(data as ResolutionScoreJobData),
  'detect-conflicts': (data) => handleConflictDetectionJob(data as ConflictDetectionJobData),
  'generate-daily-digest': (data) => handleDailyDigestJob(data as DailyDigestJobData),
  'send-ai-insight-notifications': (data) => handleAIInsightNotificationsJob(data as AIInsightNotificationJobData),
  'generate-ai-inline': (data) => handleAIInlineJob(data as AIInlineJobData),
  'staleness-check': (data) => handleStalenessCheckJob(data as StalenessCheckJobData),
  'email': (data) => handleEmailJob(data as EmailJobData),
};

async function handleJob(request: NextRequest) {
  const body = await request.text();

  const messageId = request.headers.get('upstash-message-id');
  if (messageId) {
    const isDuplicate = await deduplicateJob(messageId);
    if (!isDuplicate) {
      logger.info(`[jobs] Duplicate job ${messageId}, skipping`);
      return NextResponse.json({ ok: true, duplicate: true });
    }
  }

  const { jobType, payload } = JSON.parse(body) as {
    jobType: string;
    payload: Record<string, unknown>;
  };

  const handler = jobHandlers[jobType];
  if (!handler) {
    logger.warn(`[jobs] Unknown job type: ${jobType}`);
    return NextResponse.json({ error: `Unknown job type: ${jobType}` }, { status: 400 });
  }

  try {
    logger.info(`[jobs] Processing job: ${jobType}`);
    await handler(payload);
    return NextResponse.json({ ok: true });
  } catch (error) {
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

  // Reconstruct a request with the consumed body so handleJob can read it again.
  const clonedRequest = new NextRequest(request.url, {
    method: request.method,
    headers: request.headers,
    body,
  });

  return handleJob(clonedRequest);
}

import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
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

// Use the SDK's built-in signature verification for Next.js App Router
export const POST = verifySignatureAppRouter(handleJob, {
  devMode: process.env.NODE_ENV !== 'production',
});

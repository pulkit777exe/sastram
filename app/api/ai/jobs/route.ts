import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '@/lib/utils/api-response';
import { getAiPipelineQueues } from '@/lib/infrastructure/bullmq';
import { requireSessionOrThrow } from '@/modules/auth';
import { logger } from '@/lib/infrastructure/logger';
import type { Job } from 'bullmq';

async function findJob(jobId: string): Promise<{ job: Job; queueName: string } | null> {
  const queues = getAiPipelineQueues();

  for (const queue of queues) {
    const job = await queue.getJob(jobId);
    if (job) {
      return { job, queueName: queue.name };
    }
  }

  return null;
}

// Get job status
export async function GET(req: NextRequest) {
  try {
    const session = await requireSessionOrThrow();

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'jobId query parameter is required'), { status: 400 });
    }

    const result = await findJob(jobId);
    const job = result?.job;

    if (!job) {
      return NextResponse.json(fail('NOT_FOUND', 'Job not found'), { status: 404 });
    }

    const jobDataPayload = job.data as { userId?: string };
    if (jobDataPayload.userId && jobDataPayload.userId !== session.user.id) {
      return NextResponse.json(fail('FORBIDDEN', 'Unauthorized to access this job'), { status: 403 });
    }

    const jobState = await job.getState();
    const jobData: Record<string, unknown> = {
      id: job.id,
      name: job.name,
      state: jobState,
      queue: result?.queueName,
      createdAt: job.timestamp,
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts,
    };

    if (jobState === 'completed') {
      const jobResult = await job.returnvalue;
      jobData.result = jobResult;
    } else if (jobState === 'failed') {
      const jobError = await job.failedReason;
      jobData.error = jobError;
    }

    return NextResponse.json(ok(jobData));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Unauthorized')) {
      return NextResponse.json(fail('AUTH_REQUIRED', 'Unauthorized'), { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('Forbidden')) {
      return NextResponse.json(fail('FORBIDDEN', 'Forbidden'), { status: 403 });
    }
    logger.error('Error getting job status:', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to get job status'), { status: 500 });
  }
}

// Cancel a job
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSessionOrThrow();

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'jobId query parameter is required'), { status: 400 });
    }

    const result = await findJob(jobId);
    const job = result?.job;

    if (!job) {
      return NextResponse.json(fail('NOT_FOUND', 'Job not found'), { status: 404 });
    }

    const jobDataPayload = job.data as { userId?: string };
    if (jobDataPayload.userId && jobDataPayload.userId !== session.user.id) {
      return NextResponse.json(fail('FORBIDDEN', 'Unauthorized to cancel this job'), { status: 403 });
    }

    await job.remove();

    return NextResponse.json(ok({ success: true, message: 'Job cancelled' }));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Unauthorized')) {
      return NextResponse.json(fail('AUTH_REQUIRED', 'Unauthorized'), { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('Forbidden')) {
      return NextResponse.json(fail('FORBIDDEN', 'Forbidden'), { status: 403 });
    }
    logger.error('Error cancelling job:', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to cancel job'), { status: 500 });
  }
}

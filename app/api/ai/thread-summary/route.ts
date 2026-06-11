import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '@/lib/utils/api-response';
import { requireSessionOrThrow, requireThreadMembershipOrThrow } from '@/modules/auth';
import { prisma } from '@/lib/infrastructure/prisma';
import { AIJobType, DEFAULT_JOB_OPTIONS, getThreadSummaryQueue } from '@/lib/infrastructure/bullmq';
import { rateLimit } from '@/lib/services/rate-limit';
import { logger } from '@/lib/infrastructure/logger';
import { z } from 'zod';

const summaryRequestSchema = z.object({
  threadId: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    let threadId: string;
    try {
      const body = await req.json();
      const parsed = summaryRequestSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(fail('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid request'), { status: 400 });
      }
      threadId = parsed.data.threadId;
    } catch {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid JSON in request body'), { status: 400 });
    }

    const session = await requireSessionOrThrow();

    const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
    const rateLimitResult = await rateLimit(ip);
    if (!rateLimitResult.success) {
      return NextResponse.json(fail('RATE_LIMITED', 'Too many requests. Please try again later.'), { status: 429 });
    }

    try {
      await requireThreadMembershipOrThrow(threadId, session.user.id);
    } catch {
      return NextResponse.json(fail('FORBIDDEN', 'Forbidden'), { status: 403 });
    }

    const totalMessageCount = await prisma.message.count({
      where: { threadId: threadId, deletedAt: null },
    });

    if (totalMessageCount < 50) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Thread needs at least 50 messages before a summary can be generated.'), { status: 400 });
    }

    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      include: {
        messages: {
          take: 50,
          orderBy: { createdAt: 'desc' },
          include: { sender: true },
        },
      },
    });

    if (!thread) {
      return NextResponse.json(fail('NOT_FOUND', 'Thread not found'), { status: 404 });
    }

    const messages = thread.messages.reverse();

    const threadSummaryQueue = getThreadSummaryQueue();
    const job = await threadSummaryQueue.add(
      AIJobType.GENERATE_THREAD_SUMMARY,
      { threadId, messages, userId: session.user.id },
      {
        ...DEFAULT_JOB_OPTIONS,
        jobId: `generate-summary-${threadId}`,
      }
    );

    return NextResponse.json(ok({ jobId: job.id, status: 'pending', message: 'Summary generation started' }));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Unauthorized')) {
      return NextResponse.json(fail('AUTH_REQUIRED', 'Unauthorized'), { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('Forbidden')) {
      return NextResponse.json(fail('FORBIDDEN', 'Forbidden'), { status: 403 });
    }
    logger.error('Error generating thread summary:', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to generate summary'), { status: 500 });
  }
}

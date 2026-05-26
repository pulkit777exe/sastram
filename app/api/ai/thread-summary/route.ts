import { NextRequest, NextResponse } from 'next/server';
import { requireSectionMembershipOrThrow, requireSession } from '@/modules/auth/session';
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
    const session = await requireSession();
    if (!session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
    const rateLimitResult = await rateLimit(ip);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { threadId } = summaryRequestSchema.parse(body);

    try {
      await requireSectionMembershipOrThrow(threadId, session.user.id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const totalMessageCount = await prisma.message.count({
      where: { sectionId: threadId, deletedAt: null },
    });

    if (totalMessageCount < 50) {
      return NextResponse.json(
        { error: 'Thread needs at least 50 messages before a summary can be generated.' },
        { status: 400 }
      );
    }

    // Fetch thread and last 50 messages for AI context
    const thread = await prisma.section.findUnique({
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
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    // Reverse to chronological order for AI
    const messages = thread.messages.reverse();

    // Add job to AI queue
    const threadSummaryQueue = getThreadSummaryQueue();
    const job = await threadSummaryQueue.add(
      AIJobType.GENERATE_THREAD_SUMMARY,
      { threadId, messages, userId: session.user.id },
      {
        ...DEFAULT_JOB_OPTIONS,
        jobId: `generate-summary-${threadId}`,
      }
    );

    return NextResponse.json({
      jobId: job.id,
      status: 'pending',
      message: 'Summary generation started',
    });
  } catch (error) {
    logger.error('Error generating thread summary:', error);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}

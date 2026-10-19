import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { prisma } from '@/lib/infrastructure/prisma';
import { AIJobType } from '@/lib/queue/config';
import { enqueueJob } from '@/lib/services/queue';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { getEnv } from '@/lib/config/env';
import { guardAiRoute } from '@/lib/middleware/ai-guard-route';
import { requireSessionOrThrow } from '@/modules/auth';
import { requireReadOrThrow } from '@/lib/thread-access';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const summaryRequestSchema = z.object({
  threadId: z.string().cuid(),
});

async function parseAndValidateBody(req: NextRequest): Promise<{ threadId: string } | NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid JSON in request body'), { status: HTTP_STATUS.BAD_REQUEST });
  }
  const parsed = summaryRequestSchema.safeParse(body);
  if (!parsed.success) {
    let message: string;
    const firstIssue = parsed.error.issues[0];
    if (firstIssue && firstIssue.message) {
      message = firstIssue.message;
    } else {
      message = 'Invalid request';
    }
    return NextResponse.json(fail('VALIDATION_ERROR', message), { status: HTTP_STATUS.BAD_REQUEST });
  }
  return { threadId: parsed.data.threadId };
}

async function validateThreadEligibility(threadId: string): Promise<NextResponse | null> {
  const totalMessageCount = await prisma.message.count({
    where: { threadId, deletedAt: null },
  });
  if (totalMessageCount < 20) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Thread needs at least 20 messages before a summary can be generated.'), { status: HTTP_STATUS.BAD_REQUEST });
  }
  return null;
}

/** The guard already resolved the thread — only its messages are needed here. */
async function fetchSummaryMessages(threadId: string) {
  return prisma.message.findMany({
    where: { threadId, deletedAt: null },
    take: getEnv().AI_ANALYSIS_MESSAGE_LIMIT,
    orderBy: { createdAt: 'asc' },
    include: { sender: true },
  });
}

const handler = withErrorHandling(async (req: NextRequest) => {
  const validated = await parseAndValidateBody(req);
  if (validated instanceof NextResponse) return validated;
  const threadId = validated.threadId;

  const guard = await guardAiRoute(req, {
    path: AiCallPath.THREAD_SUMMARY,
    quota: { kind: 'analysis' },
    threadId,
    rateLimitScope: 'ai-thread-summary',
    sse: false,
    // Eligibility is cheap: reject "<20 messages" before quota/spend is consumed.
    precheck: () => validateThreadEligibility(threadId),
  });
  if (!guard.ok) return guard.response;

  const messages = await fetchSummaryMessages(threadId);

  await enqueueJob(AIJobType.GENERATE_THREAD_SUMMARY, {
    threadId,
    messages,
    userId: guard.session.user.id,
    // The guard above consumed the THREAD_SUMMARY estimate — stamp the
    // request-scoped key so the worker skips re-consumption (ADR-0001).
    alreadyBilled: randomUUID(),
  });

  return NextResponse.json(ok({ status: 'pending', message: 'Summary generation started' }));
});

/**
 * Lightweight status poll — returns just the summary column so the client can
 * pick up a completed AI job without a full RSC page refresh.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSessionOrThrow();
  const parsed = summaryRequestSchema.safeParse({ threadId: req.nextUrl.searchParams.get('threadId') });
  if (!parsed.success) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid threadId'), { status: HTTP_STATUS.BAD_REQUEST });
  }
  await requireReadOrThrow(parsed.data.threadId, session.user.id, session.user.role as never);

  const thread = await prisma.thread.findUnique({
    where: { id: parsed.data.threadId, deletedAt: null },
    select: { aiSummary: true },
  });
  if (!thread) {
    return NextResponse.json(fail('NOT_FOUND', 'Thread not found'), { status: HTTP_STATUS.NOT_FOUND });
  }
  return NextResponse.json(ok({ summary: thread.aiSummary }));
});

export { handler as POST };

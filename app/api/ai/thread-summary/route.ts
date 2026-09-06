import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { prisma } from '@/lib/infrastructure/prisma';
import { AIJobType } from '@/lib/queue/config';
import { enqueueJob } from '@/lib/services/queue';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { getEnv } from '@/lib/config/env';
import { withAiPreflight } from '@/lib/middleware/ai-preflight';
import { z } from 'zod';

const summaryRequestSchema = z.object({
  threadId: z.string(),
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

async function fetchThreadForSummary(threadId: string) {
  return prisma.thread.findFirst({
    where: { id: threadId, deletedAt: null },
    include: {
      messages: {
        take: getEnv().AI_ANALYSIS_MESSAGE_LIMIT,
        orderBy: { createdAt: 'asc' },
        include: { sender: true },
      },
    },
  });
}

const handler = withErrorHandling(async (req: NextRequest) => {
  const validated = await parseAndValidateBody(req);
  if (validated instanceof NextResponse) return validated;
  const threadId = validated.threadId;

  const preflight = await withAiPreflight(req, {
    aiCallPath: AiCallPath.THREAD_SUMMARY,
    threadId,
  });
  if (preflight instanceof NextResponse) return preflight;

  const eligibilityError = await validateThreadEligibility(threadId);
  if (eligibilityError) return eligibilityError;

  const thread = await fetchThreadForSummary(threadId);
  if (!thread) {
    return NextResponse.json(fail('NOT_FOUND', 'Thread not found'), { status: HTTP_STATUS.NOT_FOUND });
  }

  await enqueueJob(AIJobType.GENERATE_THREAD_SUMMARY, { threadId, messages: thread.messages, userId: preflight.session.user.id });

  return NextResponse.json(ok({ status: 'pending', message: 'Summary generation started' }));
});

export { handler as POST };

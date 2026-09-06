import { prisma } from '@/lib/infrastructure/prisma';
import { enqueueInlineJob } from '@/lib/services/queue';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/infrastructure/logger';
import { requireSessionOrThrow } from '@/modules/auth';
import { requireThreadAccessOrThrow } from '@/lib/thread-access';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { rateLimit } from '@/lib/services/rate-limit';
import { enforceAiSpendCap } from '@/lib/services/ai-spend-cap';
import { evaluateAiCostGate, AiCallPath } from '@/lib/services/ai-cost-classification';
import { extractAiInlineQuery } from '@/modules/messages/actions/ai-inline';
import { z } from 'zod';

const aiReplyParamsSchema = z.object({
  threadId: z.string().cuid(),
});

async function authenticateRequest() {
  return requireSessionOrThrow();
}

async function extractThreadId(context?: { params: Promise<Record<string, string>> }): Promise<string> {
  if (context && context.params) {
    const params = await context.params;
    return params.threadId;
  }
  return '';
}

function validateThreadId(threadId: string): NextResponse | null {
  const parsedParams = aiReplyParamsSchema.safeParse({ threadId });
  if (!parsedParams.success) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid thread ID'), { status: HTTP_STATUS.BAD_REQUEST });
  }
  return null;
}

async function checkRateLimitOrThrow(session: { user: { id: string } }, request: NextRequest): Promise<NextResponse | null> {
  const forwarded = request.headers.get('x-forwarded-for');
  let ip: string;
  if (forwarded) {
    ip = forwarded;
  } else {
    ip = 'unknown';
  }
  const rateLimitKey = `ai-reply:${session.user.id}:${ip}`;
  const rateLimitResult = await rateLimit({ key: rateLimitKey, type: 'api' });
  if (!rateLimitResult.success) {
    return NextResponse.json(fail('RATE_LIMITED', 'Too many requests. Please try again later.'), { status: HTTP_STATUS.RATE_LIMITED });
  }
  return null;
}

async function checkSpendCapOrThrow(): Promise<NextResponse | null> {
  const spendCap = await enforceAiSpendCap(AiCallPath.AI_REPLY_STREAM);
  if (!spendCap.allowed) {
    return NextResponse.json(fail('SERVICE_UNAVAILABLE', 'AI features temporarily unavailable due to high demand. Resets at UTC midnight.'), { status: HTTP_STATUS.SERVICE_UNAVAILABLE });
  }
  const gate = evaluateAiCostGate({ path: AiCallPath.AI_REPLY_STREAM, spendCapAllowed: spendCap.allowed });
  if (!gate.allowed) {
    return NextResponse.json(fail('SERVICE_UNAVAILABLE', 'AI features temporarily unavailable due to high demand. Resets at UTC midnight.'), { status: HTTP_STATUS.SERVICE_UNAVAILABLE });
  }
  return null;
}

async function checkThreadAccessOrThrow(threadId: string, session: { user: { id: string; role: unknown } }): Promise<NextResponse | null> {
  try {
    await requireThreadAccessOrThrow(threadId, session.user.id, session.user.role as never);
    return null;
  } catch {
    return NextResponse.json(fail('FORBIDDEN', 'Forbidden'), { status: HTTP_STATUS.FORBIDDEN });
  }
}

async function resolveParentMessage(threadId: string) {
  return prisma.message.findFirst({
    where: {
      threadId,
      OR: [
        { content: { contains: '@sai', mode: 'insensitive' } },
        { content: { contains: '@ai', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });
}

function resolveQuery(parentMessage: { content: string }): string | null {
  const parsedQuery = extractAiInlineQuery(parentMessage.content);
  if (parsedQuery) {
    return parsedQuery;
  }
  const legacy = parentMessage.content.replace(/(?:^|\s)@ai\s+/i, '').trim();
  return legacy;
}

async function handleAiEnqueue(parentMessage: { id: string; threadId: string }, query: string, sessionUserId: string, threadId: string) {
  logger.info('[ai-reply] Queuing job:', { threadId, messageId: parentMessage.id, query });
  await enqueueInlineJob({
    messageId: parentMessage.id,
    threadId: parentMessage.threadId,
    query,
    userId: sessionUserId,
  });
}

const handler = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> }
) => {
  const session = await authenticateRequest();

  const threadId = await extractThreadId(context);
  const paramError = validateThreadId(threadId);
  if (paramError) return paramError;

  const rateLimitError = await checkRateLimitOrThrow(session, request);
  if (rateLimitError) return rateLimitError;

  const spendError = await checkSpendCapOrThrow();
  if (spendError) return spendError;

  const accessError = await checkThreadAccessOrThrow(threadId, session);
  if (accessError) return accessError;

  const parentMessage = await resolveParentMessage(threadId);
  if (!parentMessage) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'No @sai mention found'), { status: HTTP_STATUS.BAD_REQUEST });
  }

  const query = resolveQuery(parentMessage);
  if (!query) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'No question found after @sai'), { status: HTTP_STATUS.BAD_REQUEST });
  }

  await handleAiEnqueue(parentMessage, query, session.user.id, threadId);

  return NextResponse.json(ok({ queued: true }));
});

export { handler as POST };

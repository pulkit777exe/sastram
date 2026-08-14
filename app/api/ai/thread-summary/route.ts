import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, withErrorHandling } from '@/lib/utils/api-response';
import { requireSessionOrThrow } from '@/modules/auth/session';
import { requireThreadAccessOrThrow } from '@/lib/thread-access';
import { prisma } from '@/lib/infrastructure/prisma';
import { AIJobType } from '@/lib/queue/config';
import { enqueueJob } from '@/lib/services/queue';
import { rateLimit } from '@/lib/services/rate-limit';
import { consumeAiAnalysisQuota } from '@/lib/services/daily-quota';
import { enforceAiSpendCap } from '@/lib/services/ai-spend-cap';
import { evaluateAiCostGate, AiCallPath } from '@/lib/services/ai-cost-classification';
import { getEnv } from '@/lib/config/env';
import { z } from 'zod';

const summaryRequestSchema = z.object({
  threadId: z.string(),
});

const handler = withErrorHandling(async (req: NextRequest) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid JSON in request body'), { status: 400 });
  }

  const parsed = summaryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(fail('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid request'), { status: 400 });
  }
  const { threadId } = parsed.data;

  const session = await requireSessionOrThrow();

  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  const rateLimitResult = await rateLimit(ip);
  if (!rateLimitResult.success) {
    return NextResponse.json(fail('RATE_LIMITED', 'Too many requests. Please try again later.'), { status: 429 });
  }

  // Per-user daily AI analysis quota
  const quota = await consumeAiAnalysisQuota(session.user.id);
  if (!quota.allowed) {
    return NextResponse.json(fail('RATE_LIMITED', `Daily AI analysis limit reached. Resets at UTC midnight.`), { status: 429 });
  }

  // Global daily spend cap
  const spendCap = await enforceAiSpendCap(AiCallPath.THREAD_SUMMARY);
  if (!spendCap.allowed) {
    return NextResponse.json(fail('SERVICE_UNAVAILABLE', 'AI features temporarily unavailable due to high demand. Resets at UTC midnight.'), { status: 503 });
  }

  // Hard cost-aware gate: thread summary is an EXPENSIVE synthesis.
  const gate = evaluateAiCostGate({ path: AiCallPath.THREAD_SUMMARY, spendCapAllowed: spendCap.allowed });
  if (!gate.allowed) {
    return NextResponse.json(fail('SERVICE_UNAVAILABLE', 'AI features temporarily unavailable due to high demand. Resets at UTC midnight.'), { status: 503 });
  }

  try {
    await requireThreadAccessOrThrow(threadId, session.user.id, session.user.role);
  } catch {
    return NextResponse.json(fail('FORBIDDEN', 'Forbidden'), { status: 403 });
  }

  const totalMessageCount = await prisma.message.count({
    where: { threadId: threadId, deletedAt: null },
  });

  if (totalMessageCount < 20) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Thread needs at least 20 messages before a summary can be generated.'), { status: 400 });
  }

  const thread = await prisma.thread.findFirst({
    where: { id: threadId, deletedAt: null },
    include: {
      messages: {
        take: getEnv().AI_ANALYSIS_MESSAGE_LIMIT,
        orderBy: { createdAt: 'asc' },
        include: { sender: true },
      },
    },
  });

  if (!thread) {
    return NextResponse.json(fail('NOT_FOUND', 'Thread not found'), { status: 404 });
  }

  const messages = thread.messages;

  await enqueueJob(AIJobType.GENERATE_THREAD_SUMMARY, { threadId, messages, userId: session.user.id });

  return NextResponse.json(ok({ status: 'pending', message: 'Summary generation started' }));
});

export { handler as POST };

import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, withErrorHandling } from '@/lib/utils/api-response';
import { requireSessionOrThrow } from '@/modules/auth/session';
import { requireThreadAccessOrThrow } from '@/lib/thread-access';
import { prisma } from '@/lib/infrastructure/prisma';
import { aiService } from '@/lib/services/ai';
import { logger } from '@/lib/infrastructure/logger';
import { rateLimit } from '@/lib/services/rate-limit';
import { consumeAiAnalysisQuota } from '@/lib/services/daily-quota';
import { enforceAiSpendCap } from '@/lib/services/ai-spend-cap';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { z } from 'zod';

const scoreRequestSchema = z.object({
  threadId: z.string(),
});

const handler = withErrorHandling(async (req: NextRequest) => {
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

   // Global daily spend cap (RESOLUTION_SCORE is CHEAP — always allowed when cap service is up)
   const spendCap = await enforceAiSpendCap(AiCallPath.RESOLUTION_SCORE);
   if (!spendCap.allowed) {
     return NextResponse.json(fail('SERVICE_UNAVAILABLE', 'AI features temporarily unavailable due to high demand. Resets at UTC midnight.'), { status: 503 });
   }

   let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid JSON body'), { status: 400 });
  }

  const parsed = scoreRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid input'),
      { status: 400 }
    );
  }
  const { threadId } = parsed.data;

  try {
    await requireThreadAccessOrThrow(threadId, session.user.id, session.user.role);
  } catch {
    return NextResponse.json(fail('FORBIDDEN', 'Forbidden'), { status: 403 });
  }

  // Fetch thread and messages — snapshot lastVerifiedAt for optimistic locking
  const thread = await prisma.thread.findFirst({
    where: { id: threadId, deletedAt: null },
    select: {
      id: true,
      updatedAt: true,
      lastVerifiedAt: true,
      messages: {
        take: Math.min(parseInt(process.env.AI_ANALYSIS_MESSAGE_LIMIT || '50', 10) || 50, 100),
        orderBy: { createdAt: 'desc' },
        include: { sender: true },
      },
    },
  });

  if (!thread) {
    return NextResponse.json(fail('NOT_FOUND', 'Thread not found'), { status: 404 });
  }

  const previousLastVerifiedAt = thread.lastVerifiedAt;

  // Reverse to chronological order for AI
  const messages = thread.messages.reverse();

  if (messages.length === 0) {
    return NextResponse.json(ok({ score: 0 }));
  }

  const score = await aiService.calculateResolutionScore(messages);

  if (score === null) {
    return NextResponse.json(ok({ score: null }));
  }

  // Optimistic locking: only write if no other process updated lastVerifiedAt
  const updated = await prisma.thread.updateMany({
    where: {
      id: threadId,
      lastVerifiedAt: previousLastVerifiedAt,
    },
    data: { resolutionScore: score, lastVerifiedAt: new Date() },
  });

  if (updated.count === 0) {
    logger.info(`[resolution-score] Skipped write for ${threadId} — score was updated concurrently`);
  }

  return NextResponse.json(ok({ score }));
});

export { handler as POST };

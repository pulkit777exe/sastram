import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, withErrorHandling } from '@/lib/utils/api-response';
import { requireThreadMembershipOrThrow, requireSessionOrThrow } from '@/modules/auth/session';
import { prisma } from '@/lib/infrastructure/prisma';
import { aiService } from '@/lib/services/ai';
import { applyConfidenceDecay } from '@/lib/utils/confidence-decay';
import { rateLimit } from '@/lib/services/rate-limit';
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
    await requireThreadMembershipOrThrow(threadId, session.user.id);
  } catch {
    return NextResponse.json(fail('FORBIDDEN', 'Forbidden'), { status: 403 });
  }

  // Fetch thread and messages
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    include: {
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

  // Reverse to chronological order for AI
  const messages = thread.messages.reverse();

  if (messages.length === 0) {
    return NextResponse.json(ok({ score: 0 }));
  }

  const score = await aiService.calculateResolutionScore(messages);
  const { decayedScore } = applyConfidenceDecay(score, thread.updatedAt);

  await prisma.thread.update({
    where: { id: threadId },
    data: { resolutionScore: decayedScore, lastVerifiedAt: new Date() },
  });

  return NextResponse.json(ok({ score: decayedScore }));
});

export { handler as POST };

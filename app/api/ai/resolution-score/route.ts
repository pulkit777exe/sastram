import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '@/lib/utils/api-response';
import { requireSectionMembershipOrThrow } from '@/modules/auth/session';
import { auth } from '@/lib/services/auth';
import { prisma } from '@/lib/infrastructure/prisma';
import { aiService } from '@/lib/services/ai';
import { applyConfidenceDecay } from '@/lib/utils/confidence-decay';
import { rateLimit } from '@/lib/services/rate-limit';
import { logger } from '@/lib/infrastructure/logger';
import { z } from 'zod';

const scoreRequestSchema = z.object({
  threadId: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      return NextResponse.json(fail('AUTH_REQUIRED', 'Unauthorized'), { status: 401 });
    }

    const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
    const rateLimitResult = await rateLimit(ip);
    if (!rateLimitResult.success) {
      return NextResponse.json(fail('RATE_LIMITED', 'Too many requests. Please try again later.'), { status: 429 });
    }

    const body = await req.json();
    const { threadId } = scoreRequestSchema.parse(body);

    try {
      await requireSectionMembershipOrThrow(threadId, session.user.id);
    } catch {
      return NextResponse.json(fail('FORBIDDEN', 'Forbidden'), { status: 403 });
    }

    // Fetch thread and messages
    const thread = await prisma.section.findUnique({
      where: { id: threadId },
      include: {
        messages: {
          take: parseInt(process.env.AI_ANALYSIS_MESSAGE_LIMIT || '50', 10),
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

    await prisma.section.update({
      where: { id: threadId },
      data: { resolutionScore: decayedScore, lastVerifiedAt: new Date() },
    });

    return NextResponse.json(ok({ score: decayedScore }));
  } catch (error) {
    logger.error('Error calculating resolution score:', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to calculate resolution score'), { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, withErrorHandling } from '@/lib/utils/api-response';
import { prisma } from '@/lib/infrastructure/prisma';
import { aiService } from '@/lib/ai';
import { logger } from '@/lib/infrastructure/logger';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { withAiPreflight } from '@/lib/middleware/ai-preflight';
import { z } from 'zod';

const scoreRequestSchema = z.object({
  threadId: z.string(),
});

const handler = withErrorHandling(async (req: NextRequest) => {
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

  const preflight = await withAiPreflight(req, {
    aiCallPath: AiCallPath.RESOLUTION_SCORE,
    skipCostGate: true,
    threadId,
  });
  if (preflight instanceof NextResponse) return preflight;

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
  const messages = thread.messages.reverse();

  if (messages.length === 0) {
    return NextResponse.json(ok({ score: 0 }));
  }

  const score = await aiService.calculateResolutionScore(messages);

  if (score === null) {
    return NextResponse.json(ok({ score: null }));
  }

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

import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, withErrorHandling } from '@/lib/utils/api-response';
import { prisma } from '@/lib/infrastructure/prisma';
import { aiService } from '@/lib/ai';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { withAiPreflight } from '@/lib/middleware/ai-preflight';
import { z } from 'zod';

const dnaRequestSchema = z.object({
  threadId: z.string(),
});

const handler = withErrorHandling(async (req: NextRequest) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid JSON body'), { status: 400 });
  }

  const parsed = dnaRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid input'),
      { status: 400 }
    );
  }
  const { threadId } = parsed.data;

  const preflight = await withAiPreflight(req, {
    aiCallPath: AiCallPath.THREAD_DNA,
    threadId,
  });
  if (preflight instanceof NextResponse) return preflight;

  const thread = await prisma.thread.findFirst({
    where: { id: threadId, deletedAt: null },
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

  const messages = thread.messages.reverse();

  if (messages.length === 0) {
    return NextResponse.json(ok({
      dna: {
        questionType: 'other',
        expertiseLevel: 'intermediate',
        topics: ['general discussion'],
        readTimeMinutes: 1,
      },
    }));
  }

  const threadDNA = await aiService.generateThreadDNA(messages);

  await prisma.thread.update({
    where: { id: threadId },
    data: { threadDna: threadDNA },
  });

  return NextResponse.json(ok({ dna: threadDNA }));
});

export { handler as POST };

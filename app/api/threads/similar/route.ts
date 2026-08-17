import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, withErrorHandling } from '@/lib/utils/api-response';
import { prisma } from '@/lib/infrastructure/prisma';
import { aiService } from '@/lib/ai';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { parseThreadDna, type ThreadDNA } from '@/lib/schemas/thread-dna';
import { withAiPreflight } from '@/lib/middleware/ai-preflight';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

const SIMILARITY_THRESHOLD = 0.75;
const MAX_RESULTS = 3;

const similarRequestSchema = z.object({
  title: z.string().min(3).max(300),
  description: z.string().max(2000).optional(),
});

function calculateSimilarity(dna1: ThreadDNA, dna2: ThreadDNA): number {
  const topics1 = new Set(dna1.topics || []);
  const topics2 = new Set(dna2.topics || []);
  const intersection = new Set([...topics1].filter((x) => topics2.has(x)));
  const union = new Set([...topics1, ...topics2]);
  const topicSimilarity = union.size === 0 ? 0 : intersection.size / union.size;

  const questionTypeSimilarity = dna1.questionType === dna2.questionType ? 1 : 0.3;

  const expertiseLevels = ['beginner', 'intermediate', 'advanced', 'expert'];
  const level1 = expertiseLevels.indexOf(dna1.expertiseLevel);
  const level2 = expertiseLevels.indexOf(dna2.expertiseLevel);
  const expertiseSimilarity =
    level1 !== -1 && level2 !== -1
      ? 1 - Math.abs(level1 - level2) / (expertiseLevels.length - 1)
      : 0.5;

  return topicSimilarity * 0.5 + questionTypeSimilarity * 0.3 + expertiseSimilarity * 0.2;
}

const handler = withErrorHandling(async (req: NextRequest) => {
  const preflight = await withAiPreflight(req, {
    aiCallPath: AiCallPath.THREAD_DNA,
  });
  if (preflight instanceof NextResponse) return preflight;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid JSON body'), { status: 400 });
  }

  const parsed = similarRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid input'),
      { status: 400 }
    );
  }

  const { title, description } = parsed.data;

  const draftText = description ? `${title}\n\n${description}` : title;
  const draftMessage = [{ content: draftText, sender: { name: preflight.session.user.name ?? 'User' } }];

  let draftDna: ThreadDNA;
  try {
    draftDna = await aiService.generateThreadDNA(draftMessage);
  } catch {
    return NextResponse.json(fail('AI_ERROR', 'Failed to analyze thread similarity.'), { status: 500 });
  }

  const existingThreads = await prisma.thread.findMany({
    where: {
      threadDna: { not: Prisma.DbNull },
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      threadDna: true,
    },
    take: 500,
  });

  const similar = existingThreads
    .map((thread) => {
      const otherDna = parseThreadDna(thread.threadDna);
      if (!otherDna) return null;
      const similarity = calculateSimilarity(draftDna, otherDna);
      return { id: thread.id, name: thread.name, slug: thread.slug, similarity };
    })
    .filter((t): t is { id: string; name: string; slug: string; similarity: number } => t !== null)
    .filter((t) => t.similarity >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_RESULTS);

  return NextResponse.json(ok({ similar, threshold: SIMILARITY_THRESHOLD }));
});

export { handler as POST };

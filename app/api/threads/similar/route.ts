import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { prisma } from '@/lib/infrastructure/prisma';
import { aiService } from '@/lib/ai';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { parseThreadDna, type ThreadDNA } from '@/lib/schemas/thread-dna';
import { withAiPreflight } from '@/lib/middleware/ai-preflight';
import { requireSessionOrThrow } from '@/modules/auth';
import { visibilityFilter } from '@/lib/thread-access';
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
  const intersection = new Set<string>();
  for (const topic of topics1) {
    if (topics2.has(topic)) {
      intersection.add(topic);
    }
  }
  const union = new Set([...topics1, ...topics2]);
  const topicSimilarity = union.size === 0 ? 0 : intersection.size / union.size;

  const questionTypeSimilarity = dna1.questionType === dna2.questionType ? 1 : 0.3;

  const expertiseLevels = ['beginner', 'intermediate', 'advanced', 'expert'];
  const level1 = expertiseLevels.indexOf(dna1.expertiseLevel);
  const level2 = expertiseLevels.indexOf(dna2.expertiseLevel);
  let expertiseSimilarity: number;
  if (level1 !== -1 && level2 !== -1) {
    expertiseSimilarity = 1 - Math.abs(level1 - level2) / (expertiseLevels.length - 1);
  } else {
    expertiseSimilarity = 0.5;
  }

  return topicSimilarity * 0.5 + questionTypeSimilarity * 0.3 + expertiseSimilarity * 0.2;
}

export const GET = withErrorHandling(async (_req: NextRequest) => {
  const session = await requireSessionOrThrow();
  const { rateLimit } = await import('@/lib/services/rate-limit');
  const rl = await rateLimit({ key: `similar:${session.user.id}`, type: 'api' });
  if (!rl.success) return NextResponse.json(fail('RATE_LIMITED', 'Too many requests'), { status: HTTP_STATUS.RATE_LIMITED });
  const filter = await visibilityFilter(session.user.id, session.user.role as never);
  const isModeratorFilterEmpty = Object.keys(filter).length === 0;
  const baseSourceFilter: Prisma.ThreadWhereInput = isModeratorFilterEmpty ? { deletedAt: null } : { ...filter, deletedAt: null };
  const baseTargetFilter: Prisma.ThreadWhereInput = isModeratorFilterEmpty ? { deletedAt: null } : { ...filter, deletedAt: null };
  const relations = await prisma.threadRelation.findMany({
    where: isModeratorFilterEmpty
      ? { source: baseSourceFilter, target: baseTargetFilter }
      : { source: baseSourceFilter, target: baseTargetFilter },
    take: 200,
    orderBy: { similarity: 'desc' },
    include: {
      source: { select: { id: true, name: true, slug: true, messageCount: true } },
      target: { select: { id: true, name: true, slug: true, messageCount: true } },
    },
  });
  return NextResponse.json(ok(relations));
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const preflight = await withAiPreflight(req, {
    aiCallPath: AiCallPath.THREAD_DNA,
  });
  if (preflight instanceof NextResponse) return preflight;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid JSON body'), { status: HTTP_STATUS.BAD_REQUEST });
  }

  const parsed = similarRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid input'),
      { status: HTTP_STATUS.BAD_REQUEST }
    );
  }

  const { title, description } = parsed.data;

  const draftText = description ? `${title}\n\n${description}` : title;
  const draftMessage = [{ content: draftText, sender: { name: preflight.session.user.name ?? 'User' } }];

  let draftDna: ThreadDNA;
  try {
    draftDna = await aiService.generateThreadDNA(draftMessage);
  } catch {
    return NextResponse.json(fail('AI_ERROR', 'Failed to analyze thread similarity.'), { status: HTTP_STATUS.INTERNAL });
  }

  const filter = await visibilityFilter(preflight.session.user.id, preflight.session.user.role as never);
  const whereClause: Prisma.ThreadWhereInput = {
    threadDna: { not: Prisma.DbNull },
    deletedAt: null,
    ...filter,
  };
  const existingThreads = await prisma.thread.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      slug: true,
      threadDna: true,
    },
    take: 500,
  });

  const mapped = existingThreads.map((thread) => {
    const otherDna = parseThreadDna(thread.threadDna);
    if (!otherDna) return null;
    const similarity = calculateSimilarity(draftDna, otherDna);
    return { id: thread.id, name: thread.name, slug: thread.slug, similarity };
  });
  const nonNull = mapped.filter((t): t is { id: string; name: string; slug: string; similarity: number } => t !== null);
  const filtered = nonNull.filter((t) => t.similarity >= SIMILARITY_THRESHOLD);
  const sorted = filtered.sort((a, b) => b.similarity - a.similarity);
  const similar = sorted.slice(0, MAX_RESULTS);

  return NextResponse.json(ok({ similar, threshold: SIMILARITY_THRESHOLD }));
});

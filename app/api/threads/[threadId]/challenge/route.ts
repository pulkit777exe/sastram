import { prisma } from '@/lib/infrastructure/prisma';
import { enqueueJob } from '@/lib/services/queue';
import { AIJobType } from '@/lib/queue/config';
import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrThrow } from '@/modules/auth';
import { requireThreadAccessOrThrow } from '@/lib/thread-access';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { parseUserPreferences } from '@/lib/schemas/user-preferences';
import { isSafePublicUrl, sanitizeUserContent } from '@/lib/services/content-safety';
import { rateLimit } from '@/lib/services/rate-limit';
import { z } from 'zod';

const paramsSchema = z.object({ threadId: z.string().cuid() });
const bodySchema = z.object({
  counterSourceUrl: z.string().url(),
  note: z.string().max(500).optional(),
});

export const POST = withErrorHandling(async (request: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
  const session = await requireSessionOrThrow();
  const { threadId } = paramsSchema.parse(await context!.params);
  await requireThreadAccessOrThrow(threadId, session.user.id, session.user.role as never);

  try {
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { preferences: true } });
    const prefs = parseUserPreferences((user?.preferences as unknown) ?? {});
    if ((prefs as unknown as { challengeModeEnabled?: boolean }).challengeModeEnabled === false) {
      return NextResponse.json(fail('FORBIDDEN', 'Challenge mode disabled in settings'), { status: HTTP_STATUS.FORBIDDEN });
    }
  } catch {
    // best-effort: if prefs read fails, allow challenge
  }

  const body = bodySchema.parse(await request.json());
  const rl = await rateLimit({ key: `challenge:${session.user.id}`, type: 'api' });
  if (!rl.success) return NextResponse.json(fail('RATE_LIMITED', 'Too many challenges, slow down'), { status: HTTP_STATUS.RATE_LIMITED });
  if (!isSafePublicUrl(body.counterSourceUrl)) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'counterSourceUrl must be a public http/https URL'), { status: HTTP_STATUS.BAD_REQUEST });
  }
  const safeNote = body.note ? sanitizeUserContent(body.note).sanitized.slice(0, 500) : '';

  const thread = await prisma.thread.findUnique({ where: { id: threadId, deletedAt: null }, select: { name: true, resolutionScore: true, isOutdated: true } });
  if (!thread) return NextResponse.json(fail('NOT_FOUND', 'Thread not found'), { status: HTTP_STATUS.NOT_FOUND });

  const messages = await prisma.message.findMany({
    where: { threadId, deletedAt: null },
    select: { id: true, content: true, senderId: true },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  const subscribers = await prisma.threadSubscription.findMany({
    where: { threadId, isActive: true, userId: { not: null } },
    select: { userId: true },
  });

  // Inject challenge source as synthetic message for conflict detection
  const challengeMessages = [
    ...messages.map((m: { id: string; content: string; senderId: string | null }) => ({ id: m.id, content: m.content, senderId: m.senderId })),
    { id: 'challenge', content: `Counter-source: ${body.counterSourceUrl}\nNote: ${safeNote}`, senderId: session.user.id },
  ];

  await enqueueJob(AIJobType.DETECT_CONFLICTS, {
    threadId,
    messages: challengeMessages as never,
    subscriberIds: subscribers.map((s: { userId: string | null }) => s.userId!),
    threadName: thread.name,
    cronJob: false,
  });

  await enqueueJob(AIJobType.CALCULATE_RESOLUTION_SCORE, {
    threadId,
    messages: challengeMessages as never,
    subscriberIds: subscribers.map((s: { userId: string | null }) => s.userId!),
    threadName: thread.name,
    oldScore: thread.resolutionScore,
    isOutdated: thread.isOutdated,
    cronJob: false,
  });

  return NextResponse.json(ok({ queued: true, jobs: 2 }));
});

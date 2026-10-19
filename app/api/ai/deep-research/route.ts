import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { enqueueJob } from '@/lib/services/queue';
import { AIJobType } from '@/lib/queue/config';
import { prisma } from '@/lib/infrastructure/prisma';
import { parseUserPreferences } from '@/lib/schemas/user-preferences';
import { guardAiRoute } from '@/lib/middleware/ai-guard-route';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const bodySchema = z.object({ query: z.string().min(3).max(500), collectionId: z.string().cuid().optional() });

export const POST = withErrorHandling(async (request: NextRequest) => {
  // Validate the body BEFORE the guard so malformed requests never burn quota/spend.
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid request body'), { status: HTTP_STATUS.BAD_REQUEST });
  }
  const { query, collectionId } = body;

  const guard = await guardAiRoute(request, {
    path: AiCallPath.DEEP_RESEARCH,
    quota: { kind: 'search' },
    rateLimitScope: 'ai-deep-research',
    sse: false,
  });
  if (!guard.ok) return guard.response;
  const session = guard.session;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { preferences: true } });
  const prefs = parseUserPreferences(user?.preferences);
  if ((prefs as unknown as { deepResearchEnabled?: boolean }).deepResearchEnabled === false) {
    return NextResponse.json(fail('FORBIDDEN', 'Deep research disabled in settings'), { status: HTTP_STATUS.FORBIDDEN });
  }
  if (collectionId) {
    const owned = await prisma.collection.findFirst({ where: { id: collectionId, userId: session.user.id } });
    if (!owned) {
      return NextResponse.json(fail('NOT_FOUND', 'Collection not found'), { status: HTTP_STATUS.NOT_FOUND });
    }
  }
  await enqueueJob(AIJobType.GENERATE_DEEP_RESEARCH, {
    query,
    userId: session.user.id,
    collectionId,
    // The guard above consumed the DEEP_RESEARCH estimate — stamp the
    // request-scoped key so the worker skips re-consumption (ADR-0001).
    alreadyBilled: randomUUID(),
  });
  return NextResponse.json(ok({ queued: true }));
});

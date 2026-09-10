import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { enqueueJob } from '@/lib/services/queue';
import { AIJobType } from '@/lib/queue/config';
import { prisma } from '@/lib/infrastructure/prisma';
import { parseUserPreferences } from '@/lib/schemas/user-preferences';
import { withAiPreflight } from '@/lib/middleware/ai-preflight';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { z } from 'zod';

const bodySchema = z.object({ query: z.string().min(3).max(500), collectionId: z.string().cuid().optional() });

export const POST = withErrorHandling(async (request: NextRequest) => {
  const preflight = await withAiPreflight(request, {
    aiCallPath: AiCallPath.FORUM_SEARCH_SYNTHESIZE,
    quotaType: 'search',
  });
  if (preflight instanceof NextResponse) return preflight;
  const session = preflight.session;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { preferences: true } });
  const prefs = parseUserPreferences(user?.preferences);
  if ((prefs as unknown as { deepResearchEnabled?: boolean }).deepResearchEnabled === false) {
    return NextResponse.json(fail('FORBIDDEN', 'Deep research disabled in settings'), { status: HTTP_STATUS.FORBIDDEN });
  }
  const { query, collectionId } = bodySchema.parse(await request.json());
  if (collectionId) {
    const owned = await prisma.collection.findFirst({ where: { id: collectionId, userId: session.user.id } });
    if (!owned) {
      return NextResponse.json(fail('NOT_FOUND', 'Collection not found'), { status: HTTP_STATUS.NOT_FOUND });
    }
  }
  await enqueueJob(AIJobType.GENERATE_DEEP_RESEARCH, { query, userId: session.user.id, collectionId });
  return NextResponse.json(ok({ queued: true }));
});

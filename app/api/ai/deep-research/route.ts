import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, withErrorHandling } from '@/lib/utils/api-response';
import { enqueueJob } from '@/lib/services/queue';
import { AIJobType } from '@/lib/queue/config';
import { z } from 'zod';

const bodySchema = z.object({ query: z.string().min(3).max(500), collectionId: z.string().cuid().optional() });

export const POST = withErrorHandling(async (request: NextRequest) => {
  const session = await requireSessionOrThrow();
  const { query, collectionId } = bodySchema.parse(await request.json());
  await enqueueJob(AIJobType.GENERATE_DEEP_RESEARCH, { query, userId: session.user.id, collectionId });
  return NextResponse.json(ok({ queued: true }));
});

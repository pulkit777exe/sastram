import { NextRequest, NextResponse } from 'next/server';
import { requireModerator } from '@/lib/middleware/moderation';
import { ok, fail, withErrorHandling, HTTP_STATUS, errorCodeToStatus } from '@/lib/utils/api-response';
import { resolveAppeal } from '@/modules/appeals/actions';
import { z } from 'zod';

const reviewAppealSchema = z.object({
  id: z.string().min(1),
  approved: z.boolean(),
});

export const POST = withErrorHandling(async (request: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
  const { id } = await context!.params;
  await requireModerator();
  const body = await request.json();

  const validation = reviewAppealSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid input', validation.error.issues), { status: HTTP_STATUS.BAD_REQUEST });
  }

  const { id: bodyId, approved } = validation.data;

  if (bodyId !== id) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Body id must match URL id'), { status: 412 });
  }

  const result = await resolveAppeal({ appealId: id, approved });

  if ('error' in result && result.error) {
    const code = (result as { errorCode?: string }).errorCode ?? 'INTERNAL_ERROR';
    return NextResponse.json(fail(code as never, result.error), { status: errorCodeToStatus(code) });
  }

  return NextResponse.json(ok({ appeal: { id, approved, result: (result as { data?: unknown }).data } }));
});

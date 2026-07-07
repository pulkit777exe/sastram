import { NextRequest, NextResponse } from 'next/server';
import { requireModerator } from '@/lib/middleware/moderation';
import { ok, fail } from '@/lib/utils/api-response';
import { resolveAppeal } from '@/modules/appeals/actions';
import { logger } from '@/lib/infrastructure/logger';
import { z } from 'zod';

const reviewAppealSchema = z.object({
  id: z.string().min(1),
  approved: z.boolean(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireModerator();
    const body = await request.json();

    const validation = reviewAppealSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid input', validation.error.issues), { status: 400 });
    }

    const { id: bodyId, approved } = validation.data;

    if (bodyId !== id) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Body id must match URL id'), { status: 412 });
    }

    const result = await resolveAppeal(id, approved);

    if ('error' in result && result.error) {
      return NextResponse.json(fail('INTERNAL_ERROR', result.error), { status: 500 });
    }

    return NextResponse.json(ok({ appeal: { id, approved } }));
  } catch (error) {
    logger.error('[appeals/review] POST failed', { appealId: id, error });
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to review appeal'), {
      status: 500,
    });
  }
}

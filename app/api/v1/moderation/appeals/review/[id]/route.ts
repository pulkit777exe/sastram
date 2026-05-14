import { NextRequest, NextResponse } from 'next/server';
import { requireModerator } from '@/lib/middleware/moderation';
import { ok, fail } from '@/lib/http/api-response';
import { resolveAppeal } from '@/modules/appeals/actions';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireModerator();
    const body = await request.json();

    if (body.id != id) {
      return NextResponse.json(fail('ID_ERROR', 'reset is required'), {
        status: 412,
      });
    }

    if (typeof body.approved !== 'boolean') {
      return NextResponse.json(
        fail('VALIDATION_ERROR', 'approved is required and must be a boolean'),
        {
          status: 400,
        }
      );
    }

    const result = await resolveAppeal(id, body.approved);

    if ('error' in result && result.error) {
      return NextResponse.json(fail('INTERNAL_ERROR', result.error), { status: 500 });
    }

    return NextResponse.json(ok({ appeal: { id, approved: body.approved } }));
  } catch (error) {
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to review appeal', error), {
      status: 500,
    });
  }
}

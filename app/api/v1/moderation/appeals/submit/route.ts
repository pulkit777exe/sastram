import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/services/auth';
import { ok, fail } from '@/lib/utils/api-response';
import { submitAppeal } from '@/modules/appeals/actions';

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json(fail('AUTH_REQUIRED', 'Unauthorized'), { status: 401 });
    }
    const body = await request.json();

    if (!body.reason) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'reason is required'), { status: 400 });
    }

    // Create FormData object from request body
    const formData = new FormData();
    formData.append('reason', body.reason);
    if (body.reportId) {
      formData.append('reportId', body.reportId);
    }

    const result = await submitAppeal(formData);

    if (result.error) {
      return NextResponse.json(fail('INTERNAL_ERROR', result.error), { status: 500 });
    }

    return NextResponse.json(ok({ appeal: { reason: body.reason, reportId: body.reportId } }));
  } catch (error) {
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to submit appeal', error), {
      status: 500,
    });
  }
}

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/moderation';
import { ok, fail } from '@/lib/utils/api-response';
import { getSlaMetrics } from '@/lib/services/moderation-sla';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json(fail('AUTH_REQUIRED', 'Admin access required'), { status: 403 });
  }

  try {
    const metrics = await getSlaMetrics();
    return NextResponse.json(ok(metrics));
  } catch {
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to fetch SLA metrics'), { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/moderation';
import { ok, withErrorHandling } from '@/lib/utils/api-response';
import { getSlaMetrics } from '@/lib/services/moderation-sla';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  await requireAdmin();

  const metrics = await getSlaMetrics();
  return NextResponse.json(ok(metrics));
});

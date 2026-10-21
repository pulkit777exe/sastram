import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Liveness probe — process-only, no database/Redis/AI calls.
 *
 * Orchestrators must use this endpoint for restart decisions. The richer
 * `/api/health` route is a readiness check: a transient database outage
 * should remove an instance from rotation, not cause a restart loop.
 */
export function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}

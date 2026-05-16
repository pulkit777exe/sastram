import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/moderation';
import { getWsStats } from '@/lib/infrastructure/websocket/server';
import { ok, fail } from '@/lib/http/api-response';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json(fail('AUTH_REQUIRED', 'Admin access required'), { status: 403 });
  }

  const ws = getWsStats();

  const memory = process.memoryUsage();
  const now = Date.now();
  const uptime = process.uptime();

  return NextResponse.json(
    ok({
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? 'unknown',
      uptime,
      uptimeHuman: formatUptime(uptime),
      memory: {
        rss: Math.round(memory.rss / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024) + ' MB',
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + ' MB',
      },
      websocket: ws,
    })
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.join(' ') || '<1m';
}

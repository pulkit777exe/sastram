import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/moderation';
import { ok, withErrorHandling } from '@/lib/utils/api-response';

export const dynamic = 'force-dynamic';

const BYTES_PER_MB = 1024 * 1024;
const SECONDS_PER_DAY = 86400;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;

function formatMegabytes(bytes: number): string {
  return Math.round(bytes / BYTES_PER_MB) + ' MB';
}

export const GET = withErrorHandling(async () => {
  await requireAdmin();

  const memory = process.memoryUsage();
  const uptime = process.uptime();

  return NextResponse.json(
    ok({
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? 'unknown',
      uptime,
      uptimeHuman: formatUptime(uptime),
      memory: {
        rss: formatMegabytes(memory.rss),
        heapTotal: formatMegabytes(memory.heapTotal),
        heapUsed: formatMegabytes(memory.heapUsed),
      },
    })
  );
});

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / SECONDS_PER_DAY);
  const h = Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const m = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.join(' ') || '<1m';
}

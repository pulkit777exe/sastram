import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/middleware/cron-auth';
import { ok, fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { promoteThreadsToKnowledgePages } from '@/lib/services/knowledge-promotion';
import { logger } from '@/lib/infrastructure/logger';

export async function GET(req: NextRequest) {
  // Cron auth — best-effort with logging (KISS: log and return, never throw unhandled)
  try {
    const authError = verifyCronAuth(req);
    if (authError) {
      logger.warn('[cron/promote-knowledge] unauthorized', { path: req.nextUrl.pathname });
      return authError;
    }
  } catch (error) {
    logger.error('[cron/promote-knowledge] auth check failed', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Auth check failed'), {
      status: HTTP_STATUS.INTERNAL,
    });
  }

  // Knowledge promotion is best-effort and idempotent — never throws unhandled.
  // promoteThreadsToKnowledgePages already handles per-thread try/catch and DB errors,
  // but keep outer catch as safety net (KISS).
  try {
    const result = await promoteThreadsToKnowledgePages();
    return NextResponse.json(ok(result));
  } catch (error) {
    logger.error('[cron/promote-knowledge] failed', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Knowledge promotion failed'), {
      status: HTTP_STATUS.INTERNAL,
    });
  }
}

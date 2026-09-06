import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/middleware/cron-auth';
import { ok, fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { promoteThreadsToKnowledgePages } from '@/lib/services/knowledge-promotion';
import { logger } from '@/lib/infrastructure/logger';

export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) {
    return authError;
  }

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

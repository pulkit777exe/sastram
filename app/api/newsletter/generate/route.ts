import { NextRequest, NextResponse } from 'next/server';
import { processPendingDigests } from '@/modules/newsletter/service';
import { logger } from '@/lib/infrastructure/logger';
import { verifyCronAuth } from '@/lib/utils/cron-auth';

export async function POST(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) {
    return authError;
  }

  try {
    await processPendingDigests();
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error generating newsletter:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

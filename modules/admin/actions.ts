'use server';

import { logger } from '@/lib/infrastructure/logger';

import { requireRole } from '@/modules/policy';
import { listThreads } from '@/modules/threads';

export async function getAdminDashboardData() {
  try {
    await requireRole(['ADMIN']);
    const threads = await listThreads();

    return { data: { threads }, error: null, ok: true, errorCode: null };
  } catch (error) {
    logger.error('[getAdminDashboardData]', error);
    return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
  }
}

export { deleteThread } from '@/modules/moderation';

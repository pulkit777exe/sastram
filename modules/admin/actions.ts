'use server';

import { logger } from '@/lib/infrastructure/logger';

import { requireRole } from '@/modules/policy';
import { listThreads } from '@/modules/threads';
import { deleteThread } from '@/modules/moderation';

export async function getAdminDashboardData() {
  try {
    await requireRole(['ADMIN']);

    const threads = await listThreads();

    return {
      data: {
        threads,
      },
      error: null,
    };
  } catch (error) {
    logger.error('[getAdminDashboardData]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

// Re-export moderation actions for admin use
export { deleteThread } from '@/modules/moderation';

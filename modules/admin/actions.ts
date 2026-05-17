'use server';

import { logger } from '@/lib/infrastructure/logger';

import { requireRole } from '@/modules/policy';
import { listCommunities } from '@/modules/communities/repository';
import { listThreads } from '@/modules/threads/repository';
import { deleteCommunity, deleteThread } from '@/modules/moderation/actions';

export async function getAdminDashboardData() {
  try {
    await requireRole(['ADMIN']);

    const [communities, threads] = await Promise.all([listCommunities(), listThreads()]);

    return {
      data: {
        communities,
        threads,
      },
      error: null,
      ok: true,
      errorCode: null,
    };
  } catch (error) {
    logger.error('[getAdminDashboardData]', error);
    return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
  }
}

export { deleteCommunity, deleteThread } from '@/modules/moderation/actions';

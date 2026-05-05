'use server';

import { logger } from '@/lib/infrastructure/logger';

import { requireRole } from '@/modules/policy';
import { listCommunities } from '@/modules/communities/repository';
import { listThreads } from '@/modules/threads/repository';
// Note: createCommunityAction and createThreadAction should be implemented in their respective modules
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
    };
  } catch (error) {
    logger.error('[getAdminDashboardData]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

// Re-export moderation actions for admin use
export { deleteCommunity, deleteThread } from '@/modules/moderation/actions';
// Note: createCommunityAction and createThreadAction should be implemented in their respective modules
// For now, these are handled by moderation actions

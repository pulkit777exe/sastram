"use server";

/**
 * Admin module actions
 * Administrative actions that require admin privileges
 */

import { requireSession, assertAdmin } from "@/modules/auth/session";
import { listCommunities } from "@/modules/communities/repository";
import { listThreads } from "@/modules/threads/repository";
// Note: createCommunityAction and createThreadAction should be implemented in their respective modules
import { deleteCommunity, deleteThread } from "@/modules/moderation/actions";

export async function getAdminDashboardData() {
  const session = await requireSession();
  assertAdmin(session.user);

  const [communities, threads] = await Promise.all([
    listCommunities(),
    listThreads(),
  ]);

  return {
    success: true,
    data: {
      communities,
      threads,
    },
  };
}

// Re-export moderation actions for admin use
export { deleteCommunity, deleteThread } from "@/modules/moderation/actions";
// Note: createCommunityAction and createThreadAction should be implemented in their respective modules
// For now, these are handled by moderation actions


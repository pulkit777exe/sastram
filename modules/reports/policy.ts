import { requireModerationRole } from '@/modules/policy';

export async function requireReportsModeratorSession() {
  return requireModerationRole();
}

export function assertCanReportOwnMessage(reporterId: string, senderId: string) {
  if (reporterId === senderId) {
    throw new Error('You cannot report your own message');
  }
}

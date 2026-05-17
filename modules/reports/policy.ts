export { requireModerationRole as requireReportsModeratorSession } from '@/modules/policy';

export function assertCanReportOwnMessage(reporterId: string, senderId: string) {
  if (reporterId === senderId) {
    throw new Error('You cannot report your own message');
  }
}

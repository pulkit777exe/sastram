// Single seam for AI jobs — 8 shallow workers coalesced into ai-jobs.ts
export {
  handleThreadSummaryJob,
  handleThreadDnaJob,
  handleResolutionScoreJob,
  handleConflictDetectionJob,
  handleDailyDigestJob,
  handleStalenessCheckJob,
  handleAIInsightNotificationsJob,
  handleDeepResearchJob,
} from './ai-jobs';
export { handleAIInlineJob } from './ai-inline.worker';

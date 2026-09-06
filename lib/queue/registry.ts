import { AIJobType } from './config';
import {
  handleThreadSummaryJob,
  handleThreadDnaJob,
  handleResolutionScoreJob,
  handleConflictDetectionJob,
  handleDailyDigestJob,
  handleStalenessCheckJob,
  handleAIInsightNotificationsJob,
  handleDeepResearchJob,
} from './workers';
import { handleAIInlineJob } from './workers/ai-inline.worker';
import { handleEmailJob } from './workers/email.worker';
import type {
  ThreadSummaryJobData,
  ThreadDnaJobData,
  ResolutionScoreJobData,
  ConflictDetectionJobData,
  DailyDigestJobData,
  StalenessCheckJobData,
  AIInsightNotificationJobData,
  AIInlineJobData,
  EmailJobData,
  DeepResearchJobData,
} from './types';

export type JobHandlerMap = {
  [AIJobType.GENERATE_THREAD_SUMMARY]: (data: ThreadSummaryJobData) => Promise<unknown>;
  [AIJobType.GENERATE_THREAD_DNA]: (data: ThreadDnaJobData) => Promise<unknown>;
  [AIJobType.CALCULATE_RESOLUTION_SCORE]: (data: ResolutionScoreJobData) => Promise<unknown>;
  [AIJobType.DETECT_CONFLICTS]: (data: ConflictDetectionJobData) => Promise<unknown>;
  [AIJobType.GENERATE_DAILY_DIGEST]: (data: DailyDigestJobData) => Promise<unknown>;
  [AIJobType.SEND_AI_INSIGHT_NOTIFICATIONS]: (data: AIInsightNotificationJobData) => Promise<unknown>;
  [AIJobType.GENERATE_AI_INLINE]: (data: AIInlineJobData) => Promise<unknown>;
  [AIJobType.STALENESS_CHECK]: (data: StalenessCheckJobData) => Promise<unknown>;
  [AIJobType.GENERATE_DEEP_RESEARCH]: (data: DeepResearchJobData) => Promise<unknown>;
  email: (data: EmailJobData) => Promise<unknown>;
};

export const jobHandlers: JobHandlerMap = {
  [AIJobType.GENERATE_THREAD_SUMMARY]: handleThreadSummaryJob,
  [AIJobType.GENERATE_THREAD_DNA]: handleThreadDnaJob,
  [AIJobType.CALCULATE_RESOLUTION_SCORE]: handleResolutionScoreJob,
  [AIJobType.DETECT_CONFLICTS]: handleConflictDetectionJob,
  [AIJobType.GENERATE_DAILY_DIGEST]: handleDailyDigestJob,
  [AIJobType.SEND_AI_INSIGHT_NOTIFICATIONS]: handleAIInsightNotificationsJob,
  [AIJobType.GENERATE_AI_INLINE]: handleAIInlineJob,
  [AIJobType.STALENESS_CHECK]: handleStalenessCheckJob,
  [AIJobType.GENERATE_DEEP_RESEARCH]: handleDeepResearchJob,
  email: handleEmailJob,
};

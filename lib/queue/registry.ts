import { AIJobType } from './config';
import {
  handleThreadSummaryJob,
  handleThreadDnaJob,
  handleResolutionScoreJob,
  handleConflictDetectionJob,
  handleDailyDigestJob,
  handleStalenessCheckJob,
  handleAIInsightNotificationsJob,
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
} from './types';

export type JobHandlerMap = {
  'generate-thread-summary': (data: ThreadSummaryJobData) => Promise<unknown>;
  'generate-thread-dna': (data: ThreadDnaJobData) => Promise<unknown>;
  'calculate-resolution-score': (data: ResolutionScoreJobData) => Promise<unknown>;
  'detect-conflicts': (data: ConflictDetectionJobData) => Promise<unknown>;
  'generate-daily-digest': (data: DailyDigestJobData) => Promise<unknown>;
  'send-ai-insight-notifications': (data: AIInsightNotificationJobData) => Promise<unknown>;
  'generate-ai-inline': (data: AIInlineJobData) => Promise<unknown>;
  [AIJobType.STALENESS_CHECK]: (data: StalenessCheckJobData) => Promise<unknown>;
  email: (data: EmailJobData) => Promise<unknown>;
};

export const jobHandlers: JobHandlerMap = {
  'generate-thread-summary': handleThreadSummaryJob,
  'generate-thread-dna': handleThreadDnaJob,
  'calculate-resolution-score': handleResolutionScoreJob,
  'detect-conflicts': handleConflictDetectionJob,
  'generate-daily-digest': handleDailyDigestJob,
  'send-ai-insight-notifications': handleAIInsightNotificationsJob,
  'generate-ai-inline': handleAIInlineJob,
  [AIJobType.STALENESS_CHECK]: handleStalenessCheckJob,
  email: handleEmailJob,
};

export interface JobMessageData {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  senderId: string;
  threadId: string;
  parentId: string | null;
  depth: number;
  isAiResponse: boolean;
  sender: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
}

export interface AIConflictResult {
  hasConflict: boolean;
  conflictingMessages?: number[];
  reason?: string;
}

export interface ThreadSummaryJobData {
  threadId: string;
  messages: JobMessageData[];
  userId?: string;
  cronJob?: boolean;
}

export interface ThreadDnaJobData {
  threadId: string;
  messages: JobMessageData[];
  userId?: string;
  cronJob?: boolean;
}

export interface ResolutionScoreJobData {
  threadId: string;
  messages: JobMessageData[];
  subscriberIds?: string[];
  threadName?: string;
  oldScore?: number | null;
  isOutdated?: boolean;
  userId?: string;
  cronJob?: boolean;
}

export interface ConflictDetectionJobData {
  threadId: string;
  messages: JobMessageData[];
  subscriberIds?: string[];
  threadName?: string;
  oldScore?: number | null;
  userId?: string;
  cronJob?: boolean;
}

export interface DailyDigestJobData {
  messages: JobMessageData[];
  subscriberIds: string[];
  threadId?: string;
  userId?: string;
  cronJob?: boolean;
}

export interface AIInsightNotificationJobData {
  subscriberIds: string[];
  threadId: string;
  threadName: string;
  oldScore?: number;
  newScore?: number;
  isOutdated?: boolean;
  conflictResult?: AIConflictResult;
  userId?: string;
  cronJob?: boolean;
}

export interface EmailJobData {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  type?: string;
  metadata?: Record<string, unknown>;
  templateId?: string;
  data?: Record<string, string>;
}

export interface AIInlineJobData {
  messageId: string;
  threadId: string;
  query: string;
  userId: string;
}

export interface StalenessCheckJobData {
  threadId?: string;
  cronJob?: boolean;
  triggeredBy?: string;
}

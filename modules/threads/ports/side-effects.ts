import type { JobMessageData } from '@/lib/queue/types';

type InitialMessage = Pick<JobMessageData, 'id' | 'content' | 'senderId' | 'sender' | 'createdAt'>;

export interface ThreadActivityRecord {
  userId: string;
  type: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export interface ThreadSideEffectsPort {
  enqueueInitialAiJobs: (args: {
    threadId: string;
    message: InitialMessage;
  }) => Promise<void>;
  revalidateThreadPage: (slug: string | null) => void;
  revalidateDashboard: () => void;
  recordActivity: (args: ThreadActivityRecord) => Promise<unknown>;
  slugExists: (slug: string) => Promise<boolean>;
  /** Fire-and-forget: never throws, best-effort expertise refresh. */
  refreshExpertise: (userId: string) => void;
  copyThreadTags: (sourceThreadId: string, destThreadId: string) => Promise<void>;
}

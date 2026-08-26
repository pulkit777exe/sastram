import type { JobMessageData } from '@/lib/queue/types';

type InitialMessage = Pick<JobMessageData, 'id' | 'content' | 'senderId' | 'sender' | 'createdAt'>;

export interface ThreadSideEffectsPort {
  enqueueInitialAiJobs: (args: {
    threadId: string;
    message: InitialMessage;
  }) => Promise<void>;
}

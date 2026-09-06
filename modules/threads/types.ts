import type {
  Attachment,
  Message,
  Reaction,
  Thread,
  ThreadVisibility,
  User,
} from '@prisma/client';
import type { ThreadDNA } from '@/lib/schemas/thread-dna';
import type { MessageWithDetails } from '@/modules/messages/types';

export type { ThreadWithFullContext } from './threads-read/repository';
export type { ThreadDNA };

export type ThreadRecord = Thread & {
  creator?: User | null;
  messages?: (Message & {
    sender?: User | null;
    reactions?: Reaction[];
    attachments?: Attachment[];
    replies?: Message[];
  })[];
  subscriptions?: { id: string; email: string }[];
};

export interface ThreadSummary {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  visibility: ThreadVisibility;
  messageCount: number;
  activeUsers: number;
  latestMessage?: {
    id: string;
    content: string;
    createdAt: Date;
    sender: {
      id: string;
      name: string | null;
      image: string | null;
    };
  } | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}

export interface ThreadDetail extends ThreadSummary {
  messages: MessageWithDetails[];
  aiSummary?: string | null;
  subscriptionCount?: number;
  isSubscribed?: boolean;
  unreadCount?: number;
  resolutionScore?: number | null;
  threadDna?: ThreadDNA;
  lastVerifiedAt?: Date | null;
  verifiedAt?: Date | null;
  verifiedBy?: string | null;
  isOutdated?: boolean;
}

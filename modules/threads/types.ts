import type {
  Thread,
  Community,
  ThreadVisibility,
  ThreadRole,
} from '@prisma/client';
import type { MessageWithDetails } from '@/modules/messages/types';

// Base thread record with all relations
export type ThreadRecord = Thread & {
  community?: Community | null;
  creator?: import('@prisma/client').User | null;
  members?: import('@prisma/client').ThreadMember[];
  messages?: (import('@prisma/client').Message & {
    sender?: import('@prisma/client').User | null;
    reactions?: import('@prisma/client').Reaction[];
    attachments?: import('@prisma/client').Attachment[];
    replies?: import('@prisma/client').Message[];
  })[];
  subscriptions?: { id: string; email: string }[];
};

// Thread summary for list views
export interface ThreadSummary {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  visibility: ThreadVisibility;
  community?: {
    id: string;
    title: string;
    slug: string;
  } | null;
  messageCount: number;
  memberCount: number;
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

// Thread DNA metadata
export interface ThreadDNA {
  questionType: 'factual' | 'opinion' | 'technical' | 'comparison' | 'other';
  expertiseLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  topics: string[];
  readTimeMinutes: number;
}

// Detailed thread view with messages
export interface ThreadDetail extends ThreadSummary {
  messages: MessageWithDetails[];
  aiSummary?: string | null;
  subscriptionCount?: number;
  userRole?: ThreadRole | null;
  isSubscribed?: boolean;
  unreadCount?: number;
  resolutionScore?: number | null;
  threadDna?: ThreadDNA;
  lastVerifiedAt?: Date | null;
  isOutdated?: boolean;
}

// Thread filters
export interface ThreadFilters {
  communityId?: string;
  visibility?: ThreadVisibility;
  search?: string;
  sortBy?: 'recent' | 'popular' | 'active' | 'oldest';
  page?: number;
  pageSize?: number;
}

// Create/Update DTOs
export interface CreateThreadInput {
  name: string;
  slug: string;
  description?: string;
  summary?: string;
  visibility?: ThreadVisibility;
  communityId?: string;
}

export interface UpdateThreadInput {
  name?: string;
  description?: string;
  summary?: string;
  visibility?: ThreadVisibility;
}

export interface CreateMessageInput {
  content: string;
  threadId: string;
  parentId?: string;
  attachments?: {
    url: string;
    type: string;
    name?: string;
    mimeType?: string;
    size?: bigint;
  }[];
}

export interface UpdateMessageInput {
  content: string;
}

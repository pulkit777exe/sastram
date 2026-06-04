import type {
  Thread,
  Community,
  Message,
  User,
  Reaction,
  Attachment,
  ThreadVisibility,
  ThreadRole,
} from '@prisma/client';

// Re-export canonical types from their owning modules (must come before usages)
export type { MessageWithDetails, AttachmentInfo } from '@/modules/messages/types';
export type { ReactionSummary } from '@/modules/reactions/types';
export type { CommunitySummary } from '@/modules/communities/types';
export type { ThreadMember } from '@/modules/members/types';

import type { MessageWithDetails, AttachmentInfo } from '@/modules/messages/types';
import type { ReactionSummary } from '@/modules/reactions/types';
import type { CommunitySummary } from '@/modules/communities/types';
import type { ThreadMember } from '@/modules/members/types';

// Base thread record with all relations
export type ThreadRecord = Thread & {
  community?: Community | null;
  creator?: User | null;
  members?: ThreadMember[];
  messages?: (Message & {
    sender?: User | null;
    reactions?: Reaction[];
    attachments?: Attachment[];
    replies?: Message[];
  })[];
  subscriptions?: { id: string; email: string }[];
};

// Thread summary for list views
export interface ThreadSummary {
  id: string;
  slug: string;
  name: string; // Changed from 'title' to match schema
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
  createdBy: string;
}

// Detailed thread view with messages
export interface ThreadDNA {
  questionType: 'factual' | 'opinion' | 'technical' | 'comparison' | 'other';
  expertiseLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  topics: string[];
  readTimeMinutes: number;
}

export interface ThreadDetail extends ThreadSummary {
  messages: MessageWithDetails[];
  aiSummary?: string | null;
  subscriptionCount?: number;
  userRole?: ThreadRole | null; // Current user's role in this thread
  isSubscribed?: boolean;
  unreadCount?: number;
  resolutionScore?: number | null;
  threadDna?: ThreadDNA;
  lastVerifiedAt?: Date | null;
  isOutdated?: boolean;
}

// Community detail view
export interface CommunityDetail extends CommunitySummary {
  threads: ThreadSummary[];
  creator: {
    id: string;
    name: string | null;
    image: string | null;
  };
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



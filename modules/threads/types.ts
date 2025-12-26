import type { 
  Section, 
  Community, 
  Message, 
  User,
  SectionMember,
  Reaction,
  Attachment,
  SectionVisibility,
  SectionRole,
  UserStatus
} from "@prisma/client";

// Base thread record with all relations
export type ThreadRecord = Section & {
  community?: Community | null;
  creator?: User | null;
  members?: SectionMember[];
  messages?: (Message & { 
    sender?: User | null;
    reactions?: Reaction[];
    attachments?: Attachment[];
    replies?: Message[];
  })[];
  newsletterSubscriptions?: { id: string; email: string }[];
};

// Thread summary for list views
export interface ThreadSummary {
  id: string;
  slug: string;
  name: string; // Changed from 'title' to match schema
  description?: string | null;
  icon?: string | null;
  visibility: SectionVisibility;
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
      avatarUrl: string | null;
    };
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

// Detailed thread view with messages
export interface ThreadDetail extends ThreadSummary {
  messages: MessageWithDetails[];
  summary?: string | null;
  subscriptionCount?: number;
  userRole?: SectionRole | null; // Current user's role in this thread
  isSubscribed?: boolean;
  unreadCount?: number;
}

// Message with full details
export interface MessageWithDetails {
  id: string;
  content: string;
  senderId: string;
  parentId?: string | null;
  depth: number;
  isEdited: boolean;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  sender: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
    status: UserStatus;
  };
  reactions?: ReactionSummary[];
  attachments?: AttachmentInfo[];
  replyCount?: number;
  replies?: MessageWithDetails[];
}

// Reaction summary grouped by emoji
export interface ReactionSummary {
  emoji: string;
  count: number;
  users: {
    id: string;
    name: string | null;
  }[];
  hasReacted: boolean; // Whether current user has reacted with this emoji
}

// Attachment info
export interface AttachmentInfo {
  id: string;
  url: string;
  type: string;
  name?: string | null;
  mimeType?: string | null;
  size?: string | null; // Formatted size string like "2.5 MB"
}

// Community summary for list views
export interface CommunitySummary {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  visibility: string;
  threadCount: number;
  memberCount?: number;
  createdAt: Date;
}

// Community detail view
export interface CommunityDetail extends CommunitySummary {
  threads: ThreadSummary[];
  creator: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
  };
}

// User profile info
export interface UserProfile {
  id: string;
  name: string | null;
  email?: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  twitter: string | null;
  github: string | null;
  linkedin: string | null;
  status: UserStatus;
  role: string;
  createdAt: Date;
  lastSeenAt?: Date | null;
}

// Member info for thread members list
export interface ThreadMember {
  id: string;
  userId: string;
  role: SectionRole;
  joinedAt: Date;
  user: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
    status: UserStatus;
    lastSeenAt?: Date | null;
  };
}

// Notification info
export interface NotificationInfo {
  id: string;
  type: string;
  title: string;
  message?: string | null;
  data?: Record<string, unknown>;
  isRead: boolean;
  createdAt: Date;
  readAt?: Date | null;
}

// Pagination wrapper
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

// Thread filters
export interface ThreadFilters {
  communityId?: string;
  visibility?: SectionVisibility;
  search?: string;
  sortBy?: 'recent' | 'popular' | 'active' | 'oldest';
  page?: number;
  pageSize?: number;
}

// Message filters
export interface MessageFilters {
  threadId: string;
  parentId?: string | null;
  search?: string;
  page?: number;
  pageSize?: number;
  before?: string; // Message ID for cursor-based pagination
  after?: string;
}

// Create/Update DTOs
export interface CreateThreadInput {
  name: string;
  slug: string;
  description?: string;
  summary?: string;
  icon?: string;
  visibility?: SectionVisibility;
  communityId?: string;
}

export interface UpdateThreadInput {
  name?: string;
  description?: string;
  summary?: string;
  icon?: string;
  visibility?: SectionVisibility;
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

// Ban info
export interface BanInfo {
  id: string;
  userId: string;
  reason: string;
  customReason?: string | null;
  threadId?: string | null;
  isActive: boolean;
  expiresAt?: Date | null;
  createdAt: Date;
  issuer: {
    id: string;
    name: string | null;
  };
}

// Report info
export interface ReportInfo {
  id: string;
  messageId: string;
  reason: string;
  details?: string | null;
  status: string;
  createdAt: Date;
  reporter: {
    id: string;
    name: string | null;
  };
  message: {
    id: string;
    content: string;
    sender: {
      id: string;
      name: string | null;
    };
  };
}

// Analytics/Stats types
export interface ThreadStats {
  messageCount: number;
  memberCount: number;
  activeUsers24h: number;
  activeUsers7d: number;
  messagesLast24h: number;
  messagesLast7d: number;
  topContributors: {
    userId: string;
    name: string | null;
    avatarUrl: string | null;
    messageCount: number;
  }[];
}

export interface UserStats {
  messageCount: number;
  threadsCreated: number;
  communitiesCreated: number;
  reactionsReceived: number;
  joinedThreads: number;
}
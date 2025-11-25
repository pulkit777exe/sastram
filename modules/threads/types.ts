import type { Section, Community, Message, User } from "@prisma/client";

export type ThreadRecord = Section & {
  community?: Community | null;
  creator?: User | null;
  messages?: (Message & { sender?: User | null })[];
  newsletterSubscriptions?: { id: string }[];
};

export interface ThreadSummary {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  community?: {
    id: string;
    title: string;
    slug: string;
  } | null;
  messageCount: number;
  activeUsers: number;
  icon?: string | null;
}

export interface ThreadDetail extends ThreadSummary {
  messages: {
    id: string;
    content: string;
    senderId: string;
    senderName: string;
    senderAvatar?: string | null;
    createdAt: Date;
  }[];
  summary?: string | null;
  subscriptionCount?: number;
}

export interface CommunitySummary {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  threadCount: number;
}


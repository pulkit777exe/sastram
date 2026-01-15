import type {
  ReportCategory,
  ReportPriority,
  ReportStatus,
} from "@/lib/config/constants";

/**
 * Report domain types
 */

export interface Report {
  id: string;
  messageId: string;
  reporterId: string;
  category: ReportCategory;
  details: string | null;
  status: ReportStatus;
  priority: ReportPriority;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  resolution: string | null;
  createdAt: Date;
  updatedAt: Date;
  message: {
    id: string;
    content: string;
    createdAt: Date;
    sender: {
      id: string;
      name: string | null;
      email: string;
      image: string | null;
    };
    section: {
      id: string;
      name: string;
      slug: string;
    };
  };
  reporter: {
    id: string;
    name: string | null;
    email: string;
  };
  resolver: {
    id: string;
    name: string | null;
    email: string;
  } | null;
}

export interface ReportWithContext extends Report {
  categoryLabel: string;
  threadContext: {
    threadTitle: string;
    threadSlug: string;
    messageCount: number;
    surroundingMessages: Array<{
      id: string;
      content: string;
      senderId: string;
      senderName: string | null;
      createdAt: Date;
      isReported: boolean;
    }>;
  };
  reporterProfile: {
    id: string;
    name: string | null;
    email: string;
    createdAt: Date;
    reputationPoints: number;
    totalReports: number;
  };
  reportedUserProfile: {
    id: string;
    name: string | null;
    email: string;
    createdAt: Date;
    status: string;
    reputationPoints: number;
    trustScore: number;
    violationHistory: Array<{
      id: string;
      action: string;
      reason: string;
      createdAt: Date;
    }>;
  };
  aiAnalysis: {
    toxicityScore: number;
    categories: string[];
    confidence: number;
    recommendedAction: string;
  } | null;
  similarReports: Array<{
    id: string;
    category: string;
    status: string;
    createdAt: Date;
  }>;
  reportCount: number;
}

export interface ReportQueueItem {
  id: string;
  category: ReportCategory;
  priority: ReportPriority;
  status: ReportStatus;
  createdAt: Date;
  reportCount: number;
  message: {
    id: string;
    content: string;
    sender: {
      id: string;
      name: string | null;
    };
    section: {
      name: string;
      slug: string;
    };
  };
  aiConfidence: number | null;
}

export interface ReportStats {
  total: number;
  pending: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  resolvedToday: number;
  autoModActions: number;
}

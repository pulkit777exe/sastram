export const USER_ROLES = {
  USER: "USER",
  MODERATOR: "MODERATOR",
  ADMIN: "ADMIN",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const USER_STATUS = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  BANNED: "BANNED",
  DELETED: "DELETED",
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

export const REPORT_STATUS = {
  PENDING: "PENDING",
  REVIEWING: "REVIEWING",
  RESOLVED: "RESOLVED",
  DISMISSED: "DISMISSED",
} as const;

export type ReportStatus = (typeof REPORT_STATUS)[keyof typeof REPORT_STATUS];

export const REPORT_CATEGORIES = {
  HATE_SPEECH: "HATE_SPEECH",
  HARASSMENT: "HARASSMENT",
  VIOLENCE_THREATS: "VIOLENCE_THREATS",
  SELF_HARM: "SELF_HARM",
  ADULT_CONTENT: "ADULT_CONTENT",
  SPAM: "SPAM",
  SCAM_FRAUD: "SCAM_FRAUD",
  MISINFORMATION: "MISINFORMATION",
  IMPERSONATION: "IMPERSONATION",
  PRIVATE_INFO: "PRIVATE_INFO",
  COPYRIGHT: "COPYRIGHT",
  OTHER: "OTHER",
} as const;

export type ReportCategory =
  (typeof REPORT_CATEGORIES)[keyof typeof REPORT_CATEGORIES];

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  HATE_SPEECH: "Hate Speech or Discrimination",
  HARASSMENT: "Harassment or Bullying",
  VIOLENCE_THREATS: "Threatens Violence",
  SELF_HARM: "Promotes Self-Harm",
  ADULT_CONTENT: "Sexual or Adult Content",
  SPAM: "Spam",
  SCAM_FRAUD: "Scam or Fraud",
  MISINFORMATION: "False or Misleading Information",
  IMPERSONATION: "Impersonation",
  PRIVATE_INFO: "Shares Private Information",
  COPYRIGHT: "Copyright Violation",
  OTHER: "Something Else",
};

export const REPORT_PRIORITY = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
} as const;

export type ReportPriority =
  (typeof REPORT_PRIORITY)[keyof typeof REPORT_PRIORITY];

export const BAN_REASONS = {
  SPAM: "SPAM",
  HARASSMENT: "HARASSMENT",
  HATE_SPEECH: "HATE_SPEECH",
  ILLEGAL_CONTENT: "ILLEGAL_CONTENT",
  IMPERSONATION: "IMPERSONATION",
  THREATS: "THREATS",
  DOXXING: "DOXXING",
  OTHER: "OTHER",
} as const;

export type BanReason = (typeof BAN_REASONS)[keyof typeof BAN_REASONS];

export const SECTION_VISIBILITY = {
  PUBLIC: "PUBLIC",
  PRIVATE: "PRIVATE",
  RESTRICTED: "RESTRICTED",
} as const;

export type SectionVisibility =
  (typeof SECTION_VISIBILITY)[keyof typeof SECTION_VISIBILITY];

export const COMMUNITY_VISIBILITY = {
  PUBLIC: "PUBLIC",
  PRIVATE: "PRIVATE",
  UNLISTED: "UNLISTED",
} as const;

export type CommunityVisibility =
  (typeof COMMUNITY_VISIBILITY)[keyof typeof COMMUNITY_VISIBILITY];

export const MEMBER_STATUS = {
  ACTIVE: "ACTIVE",
  INVITED: "INVITED",
  LEFT: "LEFT",
  REMOVED: "REMOVED",
} as const;

export type MemberStatus = (typeof MEMBER_STATUS)[keyof typeof MEMBER_STATUS];

export const NOTIFICATION_TYPES = {
  MESSAGE: "MESSAGE",
  REPLY: "REPLY",
  MENTION: "MENTION",
  REACTION: "REACTION",
  INVITATION: "INVITATION",
  DIGEST: "DIGEST",
  REPORT: "REPORT",
  BAN: "BAN",
  SYSTEM: "SYSTEM",
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export const FILE_LIMITS = {
  MAX_SIZE_BYTES: 4.5 * 1024 * 1024,
  MAX_IMAGE_SIZE: 4.5 * 1024 * 1024,
  MAX_VIDEO_SIZE: 4.5 * 1024 * 1024,
  MAX_PDF_SIZE: 4.5 * 1024 * 1024,
} as const;

export const RATE_LIMITS = {
  MESSAGE: { count: 10, window: "10 s" },
  MODERATION: { count: 50, window: "1 m" },
  API: { count: 100, window: "1 m" },
} as const;

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

export const CONTENT_LIMITS = {
  MESSAGE_MAX_LENGTH: 10000,
  MESSAGE_MIN_LENGTH: 1,
  BIO_MAX_LENGTH: 500,
  NAME_MAX_LENGTH: 100,
  NAME_MIN_LENGTH: 2,
  TITLE_MAX_LENGTH: 200,
  TITLE_MIN_LENGTH: 3,
  DESCRIPTION_MAX_LENGTH: 1000,
} as const;

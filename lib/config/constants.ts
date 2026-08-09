export const USER_ROLES = {
  USER: 'USER',
  MODERATOR: 'MODERATOR',
  ADMIN: 'ADMIN',
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const USER_STATUS = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  BANNED: 'BANNED',
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

export const REPORT_STATUS = {
  PENDING: 'PENDING',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED',
} as const;

export type ReportStatus = (typeof REPORT_STATUS)[keyof typeof REPORT_STATUS];

export const REPORT_CATEGORIES = {
  SPAM: 'SPAM',
  HARASSMENT: 'HARASSMENT',
  MISINFORMATION: 'MISINFORMATION',
  ADULT_CONTENT: 'ADULT_CONTENT',
  OTHER: 'OTHER',
} as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[keyof typeof REPORT_CATEGORIES];

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  SPAM: 'Spam',
  HARASSMENT: 'Harassment or Bullying',
  MISINFORMATION: 'False or Misleading Information',
  ADULT_CONTENT: 'Sexual or Adult Content',
  OTHER: 'Something Else',
};

export const REPORT_PRIORITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
} as const;

export type ReportPriority = (typeof REPORT_PRIORITY)[keyof typeof REPORT_PRIORITY];

export const BAN_REASONS = {
  SPAM: 'SPAM',
  HARASSMENT: 'HARASSMENT',
  HATE_SPEECH: 'HATE_SPEECH',
  ILLEGAL_CONTENT: 'ILLEGAL_CONTENT',
  IMPERSONATION: 'IMPERSONATION',
  THREATS: 'THREATS',
  DOXXING: 'DOXXING',
  OTHER: 'OTHER',
} as const;

export type BanReason = (typeof BAN_REASONS)[keyof typeof BAN_REASONS];

export const NOTIFICATION_TYPES = {
  REPLY: 'REPLY',
  MENTION: 'MENTION',
  INVITATION: 'INVITATION',
  SYSTEM: 'SYSTEM',
  AI_INSIGHT: 'AI_INSIGHT',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export const FILE_LIMITS = {
  MAX_SIZE_BYTES: 4.5 * 1024 * 1024,
  MAX_IMAGE_SIZE: 4.5 * 1024 * 1024,
  MAX_VIDEO_SIZE: 4.5 * 1024 * 1024,
  MAX_PDF_SIZE: 4.5 * 1024 * 1024,
} as const;

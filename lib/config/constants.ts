export const USER_ROLES = {
  USER: 'USER',
  MODERATOR: 'MODERATOR',
  ADMIN: 'ADMIN',
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const REPORT_STATUS = {
  PENDING: 'PENDING',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED',
} as const;

export type ReportStatus = (typeof REPORT_STATUS)[keyof typeof REPORT_STATUS];

export const REPORT_CATEGORY_LABELS: Record<string, string> = {
  SPAM: 'Spam',
  HARASSMENT: 'Harassment or Bullying',
  MISINFORMATION: 'False or Misleading Information',
  ADULT_CONTENT: 'Sexual or Adult Content',
  OTHER: 'Something Else',
};

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

const MAX_FILE_SIZE_BYTES = 4.5 * 1024 * 1024; // single source of truth — Vercel Blob free limit

export const FILE_LIMITS = {
  MAX_SIZE_BYTES: MAX_FILE_SIZE_BYTES,
  MAX_IMAGE_SIZE: MAX_FILE_SIZE_BYTES,
  MAX_VIDEO_SIZE: MAX_FILE_SIZE_BYTES,
  MAX_PDF_SIZE: MAX_FILE_SIZE_BYTES,
} as const;

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const MS_PER_WEEK = 7 * MS_PER_DAY;

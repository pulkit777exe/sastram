/**
 * Application-wide constants
 * Centralized constants for consistency across the codebase
 */

// User Roles
export const USER_ROLES = {
  USER: "USER",
  MODERATOR: "MODERATOR",
  ADMIN: "ADMIN",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

// User Status
export const USER_STATUS = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  BANNED: "BANNED",
  DELETED: "DELETED",
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

// Report Status
export const REPORT_STATUS = {
  PENDING: "PENDING",
  REVIEWING: "REVIEWING",
  RESOLVED: "RESOLVED",
  DISMISSED: "DISMISSED",
} as const;

export type ReportStatus = (typeof REPORT_STATUS)[keyof typeof REPORT_STATUS];

// Ban Reasons
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

// Section Visibility
export const SECTION_VISIBILITY = {
  PUBLIC: "PUBLIC",
  PRIVATE: "PRIVATE",
  RESTRICTED: "RESTRICTED",
} as const;

export type SectionVisibility =
  (typeof SECTION_VISIBILITY)[keyof typeof SECTION_VISIBILITY];

// Community Visibility
export const COMMUNITY_VISIBILITY = {
  PUBLIC: "PUBLIC",
  PRIVATE: "PRIVATE",
  UNLISTED: "UNLISTED",
} as const;

export type CommunityVisibility =
  (typeof COMMUNITY_VISIBILITY)[keyof typeof COMMUNITY_VISIBILITY];

// Member Status
export const MEMBER_STATUS = {
  ACTIVE: "ACTIVE",
  INVITED: "INVITED",
  LEFT: "LEFT",
  REMOVED: "REMOVED",
} as const;

export type MemberStatus = (typeof MEMBER_STATUS)[keyof typeof MEMBER_STATUS];

// Notification Types
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

// File Upload Limits
export const FILE_LIMITS = {
  MAX_SIZE_BYTES: 4.5 * 1024 * 1024, // 4.5MB
  MAX_IMAGE_SIZE: 4.5 * 1024 * 1024,
  MAX_VIDEO_SIZE: 4.5 * 1024 * 1024,
  MAX_PDF_SIZE: 4.5 * 1024 * 1024,
} as const;

// Rate Limits
export const RATE_LIMITS = {
  MESSAGE: { count: 10, window: "10 s" },
  MODERATION: { count: 50, window: "1 m" },
  API: { count: 100, window: "1 m" },
} as const;

// Pagination
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

// Content Limits
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


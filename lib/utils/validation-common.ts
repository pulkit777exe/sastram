import { z } from 'zod';

/**
 * Commonly used validation schemas across server actions
 */

// ID validation schemas
export const userIdSchema = z.object({
  userId: z.string().cuid(),
});

export const threadIdSchema = z.object({
  threadId: z.string().cuid(),
});

export const sectionIdSchema = z.object({
  sectionId: z.string().cuid(),
});

export const messageIdSchema = z.object({
  messageId: z.string().cuid(),
});

export const appealIdSchema = z.object({
  appealId: z.string().cuid(),
});

// Pagination schemas
export const paginationSchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});

export const paginatedListSchema = z.object({
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
});

// Activity-specific query schema
export const activityQuerySchema = z.object({
  userId: z.string().cuid().optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});

// Permission check helpers
export function hasRole(
  role: string | null | undefined,
  allowedRoles: string[]
): boolean {
  return role !== null && role !== undefined && allowedRoles.includes(role);
}

export function isOwnerOrModerator(role: string | null | undefined): boolean {
  return hasRole(role, ['OWNER', 'MODERATOR']);
}

export function isAdminOrModerator(role: string | null | undefined): boolean {
  return hasRole(role, ['ADMIN', 'MODERATOR']);
}

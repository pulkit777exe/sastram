import { z } from 'zod';
import { SectionRole } from '@prisma/client';

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

// Action result helper
export function createActionResult<T>(
  data: T | null,
  error: string | null
): { data: T | null; error: string | null } {
  return { data, error };
}

export function validationError(): { data: null; error: 'Invalid input' } {
  return { data: null, error: 'Invalid input' };
}

export function serverError(): { data: null; error: 'Something went wrong' } {
  return { data: null, error: 'Something went wrong' };
}

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

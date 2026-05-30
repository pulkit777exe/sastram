import { z } from 'zod';
import { ThreadRole } from '@prisma/client';

/**
 * Member validation schemas
 */

export const joinThreadSchema = z.object({
  threadId: z.string().cuid('Invalid thread ID'),
});

export const leaveThreadSchema = z.object({
  threadId: z.string().cuid('Invalid thread ID'),
});

export const inviteMemberSchema = z.object({
  threadId: z.string().cuid('Invalid thread ID'),
  email: z.string().email('Invalid email address'),
  role: z.nativeEnum(ThreadRole).default('MEMBER'),
});

export const updateMemberRoleSchema = z.object({
  threadId: z.string().cuid('Invalid thread ID'),
  userId: z.string().cuid('Invalid user ID'),
  role: z.nativeEnum(ThreadRole),
});

export const removeMemberSchema = z.object({
  threadId: z.string().cuid('Invalid thread ID'),
  userId: z.string().cuid('Invalid user ID'),
});

export const getThreadMembersSchema = z.object({
  threadId: z.string().cuid('Invalid thread ID'),
});

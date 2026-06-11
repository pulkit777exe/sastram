'use server';

import { z } from 'zod';
import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession, assertAdmin } from '@/modules/auth';
import { revalidatePath } from 'next/cache';
import { buildThreadSlug } from '@/lib/utils/slug';
import { createThread, deleteThread, updateThreadDNA, updateResolutionScore, updateThreadStaleness } from './threads-write/repository';
import { listThreads } from './threads-core/repository';
import { getThreadMembers, updateThreadMemberRole, removeThreadMember } from './threads-members/repository';
import { createPoll } from '@/modules/polls';
import { ROUTES } from '@/lib/config/routes';
import { ThreadRole } from '@prisma/client';
import { createServerAction } from '@/lib/utils/server-action';
import { threadIdSchema } from '@/lib/utils/validation-common';
import { prismaErrorMessage } from '@/lib/utils/errors';
import { getMemberRole } from '@/modules/members';

/**
 * Parse a newline-separated string of poll options into a trimmed string array.
 */
function parsePollOptions(raw: string): string[] {
  return raw.split('\n').map((s) => s.trim()).filter(Boolean);
}

const pollOptionsFromString = z.string().transform(parsePollOptions);

const threadSchema = z.object({
  title: z.string().min(3),
  description: z.string().max(480).optional().or(z.literal('')),
  communityId: z.string().cuid().optional().or(z.literal('')),
  initialMessage: z.string().optional(),
  pollQuestion: z.string().min(1).max(500).optional(),
  pollOptions: pollOptionsFromString.optional(),
  pollExpiresAt: z.coerce.date().optional(),
});

const manageMemberSchema = z.object({
  threadId: z.string().cuid(),
  userId: z.string().cuid(),
  action: z.enum(['update_role', 'remove']),
  role: z.nativeEnum(ThreadRole).optional(),
});

/**
 * Create a new thread with an optional poll.
 * Requires admin privileges.
 */
export const createThreadAction = createServerAction(
  { schema: threadSchema, actionName: 'createThreadAction' },
  async ({ title, description, communityId, initialMessage, pollQuestion, pollOptions, pollExpiresAt }) => {
    try {
      const session = await requireSession();
      assertAdmin(session.user);

      const slug = buildThreadSlug(title);
      const thread = await createThread({
        name: title,
        description,
        communityId: communityId || null,
        slug,
        createdBy: session.user.id,
        initialMessage,
      });

      // Create poll alongside thread if poll data is provided
      if (pollQuestion && pollOptions && pollOptions.length >= 2) {
        await createPoll(thread.id, pollQuestion, pollOptions, pollExpiresAt);
      }

      revalidatePath('/dashboard');
      return { data: null, error: null, ok: true, errorCode: null };
    } catch (error) {
      logger.error('[createThreadAction]', error);
      const prismaMsg = prismaErrorMessage(error);
      if (prismaMsg) return { data: null, error: prismaMsg, ok: false, errorCode: 'INTERNAL_ERROR' };
      return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Delete a thread by ID.
 * Requires admin privileges.
 */
export const deleteThreadAction = createServerAction(
  { schema: threadIdSchema, actionName: 'deleteThreadAction' },
  async ({ threadId }) => {
    try {
      const session = await requireSession();
      assertAdmin(session.user);

      await deleteThread(threadId);
      revalidatePath('/dashboard');
      return { data: null, error: null, ok: true, errorCode: null };
    } catch (error) {
      logger.error('[deleteThreadAction]', error);
      const prismaMsg = prismaErrorMessage(error);
      if (prismaMsg) return { data: null, error: prismaMsg, ok: false, errorCode: 'INTERNAL_ERROR' };
      return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * List threads with pagination and sorting.
 */
export const getDashboardThreads = createServerAction(
  {
    schema: z.object({
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().max(100).optional(),
      sortBy: z.enum(['recent', 'popular', 'trending', 'oldest']).optional(),
    }),
    actionName: 'getDashboardThreads',
  },
  async (params) => {
    try {
      const session = await requireSession();
      const result = await listThreads({ ...params, memberUserId: session.user.id });
      return { data: result, error: null, ok: true, errorCode: null };
    } catch (error) {
      logger.error('[getDashboardThreads]', error);
      const prismaMsg = prismaErrorMessage(error);
      if (prismaMsg) return { data: null, error: prismaMsg, ok: false, errorCode: 'INTERNAL_ERROR' };
      return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Get members of a thread.
 */
export const getThreadMembersAction = createServerAction(
  { schema: threadIdSchema, actionName: 'getThreadMembersAction' },
  async ({ threadId }) => {
    try {
      const session = await requireSession();
      
      // Check thread membership
      const membership = await getMemberRole(threadId, session.user.id);
      if (!membership || membership.status !== 'ACTIVE') {
        return {
          data: null,
          error: 'You are not a member of this thread',
          errorCode: 'FORBIDDEN',
          ok: false,
        };
      }

      const members = await getThreadMembers(threadId);
      return { data: members, error: null, ok: true, errorCode: null };
    } catch (error) {
      logger.error('[getThreadMembersAction]', error);
      const prismaMsg = prismaErrorMessage(error);
      if (prismaMsg) return { data: null, error: prismaMsg, ok: false, errorCode: 'INTERNAL_ERROR' };
      return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Update a thread member's role or remove them.
 * Only the thread creator or an admin can manage members.
 */
export const manageThreadMemberAction = createServerAction(
  { schema: manageMemberSchema, actionName: 'manageThreadMemberAction' },
  async ({ threadId, userId, action, role }) => {
    try {
      const session = await requireSession();

      const thread = await prisma.thread.findUnique({
        where: { id: threadId },
        select: { createdBy: true, slug: true },
      });

      if (!thread) {
        return { data: null, error: 'Thread not found', ok: false, errorCode: 'NOT_FOUND' };
      }

      const isCreator = thread.createdBy === session.user.id;

      if (!isCreator) {
        try {
          assertAdmin(session.user);
        } catch (error) {
          const prismaMsg = prismaErrorMessage(error);
          if (prismaMsg) return { data: null, error: prismaMsg, ok: false, errorCode: 'FORBIDDEN' };
          return { data: null, error: 'Forbidden', ok: false, errorCode: 'FORBIDDEN' };
        }
      }

      if (userId === session.user.id) {
        return { data: null, error: 'Cannot manage your own membership', ok: false, errorCode: 'VALIDATION_ERROR' };
      }

      if (action === 'update_role') {
        if (!role) {
          return { data: null, error: 'Invalid input', ok: false, errorCode: 'VALIDATION_ERROR' };
        }
        await updateThreadMemberRole(threadId, userId, role);
      } else if (action === 'remove') {
        await removeThreadMember(threadId, userId);
      }

      revalidatePath(ROUTES.THREAD(thread.slug));
      return { data: null, error: null, ok: true, errorCode: null };
    } catch (error) {
      logger.error('[manageThreadMemberAction]', error);
      const prismaMsg = prismaErrorMessage(error);
      if (prismaMsg) return { data: null, error: prismaMsg, ok: false, errorCode: 'INTERNAL_ERROR' };
      return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);

'use server';

import { z } from 'zod';
import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession, assertAdmin } from '@/modules/auth';
import { revalidatePath } from 'next/cache';
import { buildThreadSlug } from '@/lib/utils/slug';
import { createThread, deleteThread, updateThreadStaleness } from './threads-write/repository';
import { listThreads } from './threads-core/repository';
import { getThreadMessagesPaginated } from './threads-read/repository';
import { createPoll } from '@/modules/polls';
import { ROUTES } from '@/lib/config/routes';
import { createServerAction } from '@/lib/utils/server-action';
import { threadIdSchema } from '@/lib/utils/validation-common';
import { prismaErrorMessage } from '@/lib/utils/errors';
import { requireThreadWriteOrThrow } from '@/lib/thread-access';

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
  initialMessage: z.string().optional(),
  pollQuestion: z.string().min(1).max(500).optional().or(z.literal('')),
  pollOptions: pollOptionsFromString.optional().or(z.literal('')),
  pollExpiresAt: z.coerce.date().optional().or(z.literal('')),
});

/**
 * Create a new thread with an optional poll.
 * Requires admin privileges.
 */
export const createThreadAction = createServerAction(
  { schema: threadSchema, actionName: 'createThreadAction' },
  async ({ title, description, initialMessage, pollQuestion, pollOptions, pollExpiresAt }) => {
    try {
      const session = await requireSession();

      const slug = buildThreadSlug(title);
      const thread = await createThread({
        name: title,
        description,
        slug,
        createdBy: session.user.id,
        initialMessage,
      });

      // Create poll alongside thread if poll data is provided
      if (pollQuestion && pollOptions && pollOptions.length >= 2) {
        await createPoll(thread.id, pollQuestion, pollOptions, pollExpiresAt || undefined);
      }

      revalidatePath(ROUTES.DASHBOARD);
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
      revalidatePath(ROUTES.DASHBOARD);
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
 * Load older messages for a thread using cursor-based pagination.
 */
export const loadThreadMessages = createServerAction(
  {
    schema: z.object({
      threadId: z.string().cuid(),
      cursor: z.string().cuid().optional(),
    }),
    actionName: 'loadThreadMessages',
  },
  async ({ threadId, cursor }) => {
    try {
      const session = await requireSession();
      await requireThreadWriteOrThrow(threadId, session.user.id, session.user.role);

      const result = await getThreadMessagesPaginated(threadId, cursor, 50);

      return {
        data: {
          messages: result.messages,
          hasMore: result.hasMore,
          nextCursor: result.nextCursor,
          totalCount: result.totalCount,
        },
        error: null,
        ok: true,
        errorCode: null,
      };
    } catch (error) {
      logger.error('[loadThreadMessages]', error);
      const prismaMsg = prismaErrorMessage(error);
      if (prismaMsg) return { data: null, error: prismaMsg, ok: false, errorCode: 'INTERNAL_ERROR' };
      return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);

export const markThreadVerified = createServerAction(
  {
    schema: z.object({
      threadId: z.string().cuid(),
    }),
    actionName: 'markThreadVerified',
  },
  async ({ threadId }) => {
    try {
      const session = await requireSession();
      await requireThreadWriteOrThrow(threadId, session.user.id, session.user.role);

      await updateThreadStaleness(threadId, false);

      revalidatePath(`${ROUTES.DASHBOARD_THREADS}/${threadId}`);

      return { data: { ok: true }, error: null, ok: true, errorCode: null };
    } catch (error) {
      logger.error('[markThreadVerified]', error);
      const prismaMsg = prismaErrorMessage(error);
      if (prismaMsg) return { data: null, error: prismaMsg, ok: false, errorCode: 'INTERNAL_ERROR' };
      return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);

export const backfillThreadMessages = createServerAction(
  {
    schema: z.object({
      threadId: z.string().cuid(),
      since: z.string().datetime(),
    }),
    actionName: 'backfillThreadMessages',
  },
  async ({ threadId, since }) => {
    try {
      const session = await requireSession();
      await requireThreadWriteOrThrow(threadId, session.user.id, session.user.role);

      const sinceDate = new Date(since);

      const messages = await prisma.message.findMany({
        where: {
          threadId,
          deletedAt: null,
          createdAt: { gt: sinceDate },
        },
        include: {
          sender: { select: { id: true, name: true, image: true } },
          attachments: { select: { id: true, url: true, type: true, name: true, size: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });

      return {
        data: { messages },
        error: null,
        ok: true,
        errorCode: null,
      };
    } catch (error) {
      logger.error('[backfillThreadMessages]', error);
      const prismaMsg = prismaErrorMessage(error);
      if (prismaMsg) return { data: null, error: prismaMsg, ok: false, errorCode: 'INTERNAL_ERROR' };
      return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);

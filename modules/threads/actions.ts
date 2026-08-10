'use server';

import { z } from 'zod';
import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession, assertAdmin } from '@/modules/auth';
import { revalidatePath } from 'next/cache';
import { buildThreadSlug } from '@/lib/utils/slug';
import { createThread, deleteThread, updateThreadStaleness } from './threads-write/repository';
import { listThreads } from './threads-core/repository';
import { getThreadMessagesPaginated, type ThreadMessage } from './threads-read/repository';
import { createPoll } from '@/modules/polls';
import { ROUTES } from '@/lib/config/routes';
import { createServerAction, type ActionResult } from '@/lib/utils/server-action';
import { actionSuccess } from '@/lib/actions/result';
import { threadIdSchema } from '@/lib/utils/validation-common';
import { AppError, prismaErrorMessage } from '@/lib/utils/errors';
import { requireThreadWriteOrThrow } from '@/lib/thread-access';

const PAGE_SIZE = 50;
const BACKFILL_LIMIT = 100;

function failure(actionName: string, error: unknown): ActionResult<never> {
  if (error instanceof AppError) {
    return {
      data: null,
      error: error.message,
      ok: false,
      errorCode: error.code as ActionResult<never>['errorCode'],
    };
  }
  logger.error(`[${actionName}]`, error);
  return {
    data: null,
    error: prismaErrorMessage(error) ?? 'Something went wrong',
    ok: false,
    errorCode: 'INTERNAL_ERROR',
  };
}

const threadIdOnly = z.object({ threadId: z.string().cuid() });

const createThreadInput = z.object({
  title: z.string().min(3),
  description: z.string().max(480).optional().or(z.literal('')),
  initialMessage: z.string().optional(),
  pollQuestion: z.string().min(1).max(500).optional().or(z.literal('')),
  // Poll options arrive as a newline-separated textarea value from the form.
  pollOptions: z
    .string()
    .transform((raw) => raw.split('\n').map((s) => s.trim()).filter(Boolean))
    .optional()
    .or(z.literal('')),
  pollExpiresAt: z.coerce.date().optional().or(z.literal('')),
});

export const createThreadAction = createServerAction(
  { schema: createThreadInput, actionName: 'createThreadAction' },
  async ({ title, description, initialMessage, pollQuestion, pollOptions, pollExpiresAt }) => {
    try {
      const session = await requireSession();

      const thread = await createThread({
        name: title,
        description,
        slug: buildThreadSlug(title),
        createdBy: session.user.id,
        initialMessage,
      });

      if (pollQuestion && pollOptions && pollOptions.length >= 2) {
        await createPoll(thread.id, pollQuestion, pollOptions, pollExpiresAt || undefined);
      }

      revalidatePath(ROUTES.DASHBOARD);
      return actionSuccess(null);
    } catch (error) {
      return failure('createThreadAction', error);
    }
  }
);

export const deleteThreadAction = createServerAction(
  { schema: threadIdSchema, actionName: 'deleteThreadAction' },
  async ({ threadId }) => {
    try {
      const session = await requireSession();
      assertAdmin(session.user);

      await deleteThread(threadId);
      revalidatePath(ROUTES.DASHBOARD);
      return actionSuccess(null);
    } catch (error) {
      return failure('deleteThreadAction', error);
    }
  }
);

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
      return actionSuccess(await listThreads({ ...params, memberUserId: session.user.id }));
    } catch (error) {
      return failure('getDashboardThreads', error);
    }
  }
);

export const loadThreadMessages = createServerAction(
  {
    schema: threadIdOnly.extend({ cursor: z.string().cuid().optional() }),
    actionName: 'loadThreadMessages',
  },
  async ({ threadId, cursor }) => {
    try {
      const session = await requireSession();
      await requireThreadWriteOrThrow(threadId, session.user.id, session.user.role);

      return actionSuccess(await getThreadMessagesPaginated(threadId, cursor, PAGE_SIZE));
    } catch (error) {
      return failure('loadThreadMessages', error);
    }
  }
);

export const markThreadVerified = createServerAction(
  { schema: threadIdOnly, actionName: 'markThreadVerified' },
  async ({ threadId }) => {
    try {
      const session = await requireSession();
      await requireThreadWriteOrThrow(threadId, session.user.id, session.user.role);

      await updateThreadStaleness(threadId, false);
      revalidatePath(`${ROUTES.DASHBOARD_THREADS}/${threadId}`);

      return actionSuccess({ ok: true });
    } catch (error) {
      return failure('markThreadVerified', error);
    }
  }
);

// Used by the live wrapper to recover messages missed while the socket was down.
export const backfillThreadMessages = createServerAction(
  {
    schema: threadIdOnly.extend({ since: z.string().datetime() }),
    actionName: 'backfillThreadMessages',
  },
  async ({ threadId, since }) => {
    try {
      const session = await requireSession();
      await requireThreadWriteOrThrow(threadId, session.user.id, session.user.role);

      const messages = await prisma.message.findMany({
        where: {
          threadId,
          deletedAt: null,
          createdAt: { gte: new Date(since) },
        },
        include: {
          sender: { select: { id: true, name: true, image: true } },
          attachments: { select: { id: true, url: true, type: true, name: true, size: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: BACKFILL_LIMIT,
      });

      // Normalise to the read-model shape so clients reuse the same mapper as
      // the paginated loader instead of hand-rolling a second conversion.
      const normalised: ThreadMessage[] = messages.map((m) => ({
        id: m.id,
        body: m.content,
        threadId: m.threadId,
        senderId: m.senderId,
        parentId: m.parentId,
        depth: m.depth,
        createdAt: m.createdAt,
        isEdited: m.isEdited,
        isPinned: m.isPinned,
        isAI: m.isAiResponse,
        deletedAt: m.deletedAt,
        likeCount: m.likeCount,
        replyCount: m.replyCount,
        author: m.sender ?? { id: '', name: null, image: null },
        reactions: [],
        _count: { replies: m.replyCount },
        attachments: m.attachments.map((a) => ({
          id: a.id,
          url: a.url,
          type: a.type,
          name: a.name,
          size: a.size !== null ? Number(a.size) : null,
        })),
      }));

      return actionSuccess({ messages: normalised });
    } catch (error) {
      return failure('backfillThreadMessages', error);
    }
  }
);

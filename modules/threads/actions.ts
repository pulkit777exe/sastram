'use server';

import { z } from 'zod';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSessionOrThrow, assertAdminOrThrow } from '@/modules/auth';
import { buildThreadSlug } from '@/modules/threads/slug';
import { createThread, deleteThread, updateThreadVerified } from './threads-write/repository';
import { forkThreadDomain } from './threads-write/service';
import { validatePollExpiry } from '@/modules/polls/validate';
import { infraThreadSideEffects } from './adapters/infra-side-effects';
import { buildThreadDTO } from './service';
import { getThreadMessagesPaginated, type ThreadMessage } from './threads-read/repository';
import { createPoll } from '@/modules/polls';
import { createServerAction } from '@/lib/utils/server-action';
import { actionSuccess } from '@/lib/actions/result';
import { threadIdSchema } from '@/lib/utils/validation-common';
import { AppError } from '@/lib/utils/errors';
import {
  requireReadOrThrow,
  requireWriteOrThrow,
  requireManageOrThrow,
} from '@/lib/thread-access';
import { sanitizeUserContent } from '@/lib/services/content-safety';
import { rateLimit } from '@/lib/services/rate-limit';

const PAGE_SIZE = 50;
const BACKFILL_LIMIT = 100;

// NOTE: error handling (AppError pass-through, redirect re-throw, sanitized
// logging) is done once by createServerAction — handlers just throw.

const threadIdOnly = z.object({ threadId: z.string().cuid() });

function splitPollOptions(raw: string): string[] {
  const result: string[] = [];
  const lines = raw.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      result.push(trimmed);
    }
  }
  return result;
}

const createThreadInput = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(480).optional().or(z.literal('')),
  initialMessage: z.string().optional(),
  pollQuestion: z.string().min(1).max(500).optional().or(z.literal('')),
  // Poll options arrive as a newline-separated textarea value from the form.
  pollOptions: z.string().transform(splitPollOptions).optional().or(z.literal('')),
  pollExpiresAt: z
    .coerce.date()
    .refine((d) => validatePollExpiry(d) === null, { message: 'Poll expiry must be in the future' })
    .optional()
    .or(z.literal('')),
});

export const createThreadAction = createServerAction(
  { schema: createThreadInput, actionName: 'createThreadAction' },
  async ({ title, description, initialMessage, pollQuestion, pollOptions, pollExpiresAt }) => {
    const session = await requireSessionOrThrow();
    const rl = await rateLimit({ key: `create-thread:${session.user.id}`, type: 'message' });
    if (!rl.success) throw new AppError('Too many threads, slow down', 'RATE_LIMITED', 429);
    const safeTitle = sanitizeUserContent(title).sanitized.trim().slice(0, 120);
    const safeDesc = description ? sanitizeUserContent(description).sanitized.trim().slice(0, 480) : description;
    const safeInitial = initialMessage ? sanitizeUserContent(initialMessage).sanitized : initialMessage;
    const safePollQ = pollQuestion ? sanitizeUserContent(pollQuestion).sanitized : pollQuestion;
    const safePollOpts = pollOptions ? pollOptions.map((o) => sanitizeUserContent(o).sanitized) : pollOptions;

    const expiryError =
      pollExpiresAt instanceof Date
        ? validatePollExpiry(pollExpiresAt)
        : null;
    if (expiryError) throw new AppError(expiryError, 'VALIDATION_ERROR', 400);

    const result = await createThread({
      name: safeTitle,
      description: safeDesc,
      slug: buildThreadSlug(safeTitle),
      createdBy: session.user.id,
      initialMessage: safeInitial,
    });

    if (result.initialMessage) {
      await infraThreadSideEffects.enqueueInitialAiJobs({
        threadId: result.thread.id,
        message: {
          id: result.initialMessage.id,
          content: result.initialMessage.content,
          senderId: session.user.id,
          sender: { id: session.user.id, name: null, image: null },
          createdAt: result.initialMessage.createdAt,
        },
      });
    }

    infraThreadSideEffects.refreshExpertise(session.user.id);

    if (safePollQ && safePollOpts && safePollOpts.length >= 2) {
      const summary = buildThreadDTO(result.thread, result.messageCount, 0);
      await createPoll(summary.id, safePollQ, safePollOpts, pollExpiresAt || undefined);
    }

    infraThreadSideEffects.revalidateDashboard();
    return actionSuccess({ slug: result.thread.slug });
  }
);

export const deleteThreadAction = createServerAction(
  { schema: threadIdSchema, actionName: 'deleteThreadAction' },
  async ({ threadId }) => {
    const session = await requireSessionOrThrow();
    assertAdminOrThrow(session.user);

    await deleteThread(threadId);
    infraThreadSideEffects.revalidateDashboard();
    return actionSuccess(null);
  }
);

const updateThreadSchema = z.object({
  threadId: z.string().cuid(),
  title: z.string().min(3).max(120),
  description: z.string().max(480).optional().or(z.literal('')),
});

/**
 * Rename a thread / edit its description. OP or moderator only.
 * The slug is intentionally left untouched so existing links keep working.
 */
export const updateThreadAction = createServerAction(
  { schema: updateThreadSchema, actionName: 'updateThreadAction' },
  async ({ threadId, title, description }) => {
    const session = await requireSessionOrThrow();
    const rl = await rateLimit({ key: `edit-thread:${session.user.id}`, type: 'message' });
    if (!rl.success) throw new AppError('Too many edits, slow down', 'RATE_LIMITED', 429);

    const ctx = await requireManageOrThrow(threadId, session.user.id, session.user.role);
    const thread = await prisma.thread.findUnique({
      where: { id: threadId, deletedAt: null },
      select: { slug: true },
    });
    if (!thread) throw new AppError('Thread not found', 'NOT_FOUND', 404);
    void ctx;

    const safeTitle = sanitizeUserContent(title).sanitized.trim().slice(0, 120);
    const safeDesc = description ? sanitizeUserContent(description).sanitized.trim().slice(0, 480) : null;

    await prisma.thread.update({
      where: { id: threadId },
      data: { name: safeTitle, description: safeDesc },
    });

    infraThreadSideEffects.revalidateThreadPage(thread.slug);
    infraThreadSideEffects.revalidateDashboard();
    return actionSuccess({ title: safeTitle, description: safeDesc });
  }
);

export const loadThreadMessages = createServerAction(
  {
    schema: threadIdOnly.extend({ cursor: z.string().cuid().optional() }),
    actionName: 'loadThreadMessages',
  },
  async ({ threadId, cursor }) => {
    const session = await requireSessionOrThrow();
    await requireWriteOrThrow(threadId, session.user.id, session.user.role);

    return actionSuccess(await getThreadMessagesPaginated(threadId, cursor, PAGE_SIZE, session.user.id));
  }
);

export const markThreadVerified = createServerAction(
  { schema: threadIdOnly, actionName: 'markThreadVerified' },
  async ({ threadId }) => {
    const session = await requireSessionOrThrow();
    await requireManageOrThrow(threadId, session.user.id, session.user.role);

    await updateThreadVerified(threadId, session.user.id);

    return actionSuccess({ ok: true });
  }
);

export const forkThreadAction = createServerAction(
  {
    schema: z.object({
      threadId: z.string().cuid(),
      title: z.string().min(3).max(120).optional(),
      visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
    }),
    actionName: 'forkThreadAction',
  },
  async ({ threadId, title, visibility }) => {
    const session = await requireSessionOrThrow();
    const rl = await rateLimit({ key: `fork:${session.user.id}`, type: 'message' });
    if (!rl.success) throw new AppError('Too many forks, slow down', 'RATE_LIMITED', 429);
    await requireReadOrThrow(threadId, session.user.id, session.user.role);

    const rawTitle = title?.trim() ? title.trim() : undefined;
    const newTitle = rawTitle
      ? sanitizeUserContent(rawTitle).sanitized.trim().slice(0, 120) || rawTitle.slice(0, 120)
      : undefined;

    const forked = await forkThreadDomain({
      sourceThreadId: threadId,
      title: newTitle,
      visibility: visibility as 'PUBLIC' | 'PRIVATE' | undefined,
      userId: session.user.id,
      sideEffects: infraThreadSideEffects,
    });

    infraThreadSideEffects.revalidateDashboard();
    return actionSuccess({ slug: forked.slug, id: forked.id });
  }
);

const IS_NOT_DELETED_MESSAGE = { deletedAt: null } as const;

function resolveBackfillAuthor(
  sender: { id: string; name: string | null; image: string | null } | null
): { id: string; name: string | null; image: string | null } {
  if (sender) return sender;
  return { id: '', name: null, image: null };
}

function mapBackfillAttachments(
  attachments: Array<{ id: string; url: string; type: string; name: string | null; size: bigint | null }>
): ThreadMessage['attachments'] {
  return attachments.map((a) => ({
    id: a.id,
    url: a.url,
    type: a.type,
    name: a.name,
    size: a.size !== null ? Number(a.size) : null,
  }));
}

function mapBackfillMessage(
  m: {
    id: string;
    content: string;
    threadId: string;
    senderId: string | null;
    parentId: string | null;
    depth: number;
    createdAt: Date;
    updatedAt: Date;
    isEdited: boolean;
    isPinned: boolean;
    isAiResponse: boolean;
    deletedAt: Date | null;
    likeCount: number;
    replyCount: number;
    sender: { id: string; name: string | null; image: string | null } | null;
    attachments: Array<{ id: string; url: string; type: string; name: string | null; size: bigint | null }>;
  }
): ThreadMessage {
  return {
    id: m.id,
    content: m.content,
    threadId: m.threadId,
    senderId: m.senderId,
    parentId: m.parentId,
    depth: m.depth,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    isEdited: m.isEdited,
    isPinned: m.isPinned,
    isAI: m.isAiResponse,
    deletedAt: m.deletedAt,
    likeCount: m.likeCount,
    replyCount: m.replyCount,
    author: resolveBackfillAuthor(m.sender),
    reactions: [],
    _count: { replies: m.replyCount },
    attachments: mapBackfillAttachments(m.attachments),
  };
}

// Used by the live wrapper to recover messages missed while the stream was down.
export const backfillThreadMessages = createServerAction(
  {
    schema: threadIdOnly.extend({ since: z.string().datetime() }),
    actionName: 'backfillThreadMessages',
  },
  async ({ threadId, since }) => {
    const session = await requireSessionOrThrow();
    await requireWriteOrThrow(threadId, session.user.id, session.user.role);

    const where = {
      threadId,
      ...IS_NOT_DELETED_MESSAGE,
      createdAt: { gte: new Date(since) },
    };
    const messages = await prisma.message.findMany({
      where,
      include: {
        sender: { select: { id: true, name: true, image: true } },
        attachments: { select: { id: true, url: true, type: true, name: true, size: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: BACKFILL_LIMIT,
    });

    const normalised = messages.map(mapBackfillMessage);

    return actionSuccess({ messages: normalised });
  }
);

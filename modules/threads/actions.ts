'use server';

import { z } from 'zod';
import { requireSessionOrThrow, assertAdminOrThrow } from '@/modules/auth';
import { buildThreadSlug } from '@/modules/threads/slug';
import { createThread, deleteThread, updateThreadVerified } from './write';
import {
  carryOverModeSchema,
  decideSupersedeDomain,
  forkKindSchema,
  forkThreadDomain,
  proposeSupersedeDomain,
  threadVisibilitySchema,
  updateThreadDomain,
} from './mutations';
import { validatePollExpiry } from '@/modules/polls/validate';
import { infraThreadSideEffects } from './infra-effects';
import { buildThreadDTO } from './service';
import { getThreadMessagesPaginated } from './read';
import { createPoll } from '@/modules/polls';
import { createServerAction } from '@/lib/utils/server-action';
import { actionSuccess } from '@/lib/utils/server-action';
import { threadIdSchema } from '@/lib/utils/validation-common';
import { AppError } from '@/lib/utils/errors';
import {
  requireReadOrThrow,
  requireWriteOrThrow,
  requireManageOrThrow,
} from '@/lib/thread-access';
import { sanitizeUserContent } from '@/lib/services/content-safety';
import { moderateThreadContent } from '@/lib/services/moderation';
import { rateLimit } from '@/lib/services/rate-limit';
import { prisma } from '@/lib/infrastructure/prisma';
import { buildClaimRowsFromEvidence, computeClaimStatus, toClaimSummary } from '@/modules/claims';
import type { ResearchEvidence, Source } from '@/modules/ai-search/types';

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
  initialMessage: z
    .string()
    .max(10000, 'Initial message must be 10000 characters or fewer')
    .optional(),
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

    const moderation = await moderateThreadContent({
      content: [safeTitle, safeDesc, safeInitial, safePollQ, ...(safePollOpts ?? [])]
        .filter(Boolean)
        .join('\n\n'),
      authorId: session.user.id,
    });
    if (!moderation.success) {
      throw new AppError(moderation.reason ?? 'Thread blocked by content filter', 'FORBIDDEN', 403);
    }

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
    void ctx;

    const safeTitle = sanitizeUserContent(title).sanitized.trim().slice(0, 120);
    const safeDesc = description ? sanitizeUserContent(description).sanitized.trim().slice(0, 480) : null;

    const moderation = await moderateThreadContent({
      content: [safeTitle, safeDesc].filter(Boolean).join('\n\n'),
      authorId: session.user.id,
      threadId,
    });
    if (!moderation.success) {
      throw new AppError(moderation.reason ?? 'Thread blocked by content filter', 'FORBIDDEN', 403);
    }

    const updated = await updateThreadDomain({
      threadId,
      name: safeTitle,
      description: safeDesc,
      sideEffects: infraThreadSideEffects,
    });

    return actionSuccess({ title: updated.title, description: updated.description });
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
      visibility: threadVisibilitySchema.optional(),
      forkKind: forkKindSchema.optional(),
      premise: z.string().max(500).optional().or(z.literal('')),
      carryOverMode: carryOverModeSchema.optional(),
      selectedMessageIds: z.array(z.string().cuid()).max(10).optional(),
    }),
    actionName: 'forkThreadAction',
  },
  async ({ threadId, title, visibility, forkKind, premise, carryOverMode, selectedMessageIds }) => {
    const session = await requireSessionOrThrow();
    const rl = await rateLimit({ key: `fork:${session.user.id}`, type: 'message' });
    if (!rl.success) throw new AppError('Too many forks, slow down', 'RATE_LIMITED', 429);
    await requireReadOrThrow(threadId, session.user.id, session.user.role);

    const rawTitle = title?.trim() ? title.trim() : undefined;
    const newTitle = rawTitle
      ? sanitizeUserContent(rawTitle).sanitized.trim().slice(0, 120) || rawTitle.slice(0, 120)
      : undefined;
    const safePremise = premise ? sanitizeUserContent(premise).sanitized.trim().slice(0, 500) : undefined;

    const forked = await forkThreadDomain({
      sourceThreadId: threadId,
      title: newTitle,
      visibility,
      userId: session.user.id,
      forkKind: forkKind ?? 'CONTINUE',
      forkPremise: safePremise,
      carryOverMode: carryOverMode ?? 'SUMMARY',
      selectedMessageIds,
      sideEffects: infraThreadSideEffects,
    });

    infraThreadSideEffects.revalidateDashboard();
    return actionSuccess({ slug: forked.slug, id: forked.id });
  }
);

export const proposeSupersedeAction = createServerAction(
  {
    schema: z.object({
      forkThreadId: z.string().cuid(),
      reason: z.string().max(500).optional().or(z.literal('')),
    }),
    actionName: 'proposeSupersedeAction',
  },
  async ({ forkThreadId, reason }) => {
    const session = await requireSessionOrThrow();
    await proposeSupersedeDomain({
      forkThreadId,
      userId: session.user.id,
      reason: reason ? sanitizeUserContent(reason).sanitized : reason,
    });
    return actionSuccess({ ok: true });
  }
);

export const decideSupersedeAction = createServerAction(
  {
    schema: z.object({
      forkThreadId: z.string().cuid(),
      decision: z.enum(['ACCEPTED', 'DECLINED']),
      reason: z.string().max(500).optional().or(z.literal('')),
    }),
    actionName: 'decideSupersedeAction',
  },
  async ({ forkThreadId, decision, reason }) => {
    const session = await requireSessionOrThrow();
    await decideSupersedeDomain({
      forkThreadId,
      userId: session.user.id,
      userRole: session.user.role,
      decision,
      reason: reason ? sanitizeUserContent(reason).sanitized : reason,
    });
    return actionSuccess({ ok: true });
  }
);

// Used by the live wrapper to recover messages missed while the stream was down.
export const backfillThreadMessages = createServerAction(
  {
    schema: threadIdOnly.extend({ since: z.string().datetime() }),
    actionName: 'backfillThreadMessages',
  },
  async ({ threadId, since }) => {
    const session = await requireSessionOrThrow();
    await requireWriteOrThrow(threadId, session.user.id, session.user.role);

    // Single canonical read path: read.ts owns the row→DTO mapping
    // (reactions, polls, attachments included). Filter by updatedAt, not just
    // createdAt: streamed AI placeholders are updated in place when generation
    // finishes or fails, and a createdAt-only window never sees that content.
    const sinceDate = new Date(since);
    const page = await getThreadMessagesPaginated(threadId, undefined, BACKFILL_LIMIT, session.user.id);
    const messages = page.messages
      .filter((m) => m.updatedAt >= sinceDate)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    return actionSuccess({ messages });
  }
);

const createVerificationThreadInput = z.object({
  sessionId: z.string().cuid(),
  title: z.string().min(3).max(120).optional().or(z.literal('')),
});

function buildVerificationInitialMessage(query: string, synthesis: string): string {
  const q = query.trim();
  const s = synthesis.trim();
  const body = s || 'No synthesized answer available.';
  const content = q ? `AI search: ${q}\n\n${body}` : body;
  return content.slice(0, 10000);
}

export const createVerificationThreadAction = createServerAction(
  { schema: createVerificationThreadInput, actionName: 'createVerificationThreadAction' },
  async ({ sessionId, title }) => {
    const session = await requireSessionOrThrow();
    const rl = await rateLimit({ key: `create-verify-thread:${session.user.id}`, type: 'message' });
    if (!rl.success) throw new AppError('Too many threads, slow down', 'RATE_LIMITED', 429);

    const aiSession = await prisma.aiSearchSession.findFirst({
      where: { id: sessionId, userId: session.user.id, deletedAt: null },
      include: {
        results: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!aiSession) {
      throw new AppError('AI search session not found', 'NOT_FOUND', 404);
    }

    const result = aiSession.results[0];
    if (!result) {
      throw new AppError('No claimable evidence available for this answer. Start a plain verification thread instead.', 'VALIDATION_ERROR', 400);
    }

    const evidence = (result.evidence as unknown as ResearchEvidence[] | null) ?? [];
    const sources = (result.sources as unknown as Source[] | null) ?? [];
    const claimRows = buildClaimRowsFromEvidence(evidence, sources);
    if (claimRows.length === 0) {
      throw new AppError('No claimable evidence available for this answer. Start a plain verification thread instead.', 'VALIDATION_ERROR', 400);
    }

    const rawTitle = title?.trim() || (aiSession.title?.trim() ? `Verify: ${aiSession.title.trim()}` : `Verify: ${aiSession.query.trim()}`);
    const safeTitle = sanitizeUserContent(rawTitle).sanitized.trim().slice(0, 120) || 'Verification thread';
    const initialMessage = buildVerificationInitialMessage(aiSession.query, result.synthesis ?? '');
    const safeInitial = sanitizeUserContent(initialMessage).sanitized;

    const moderation = await moderateThreadContent({
      content: [safeTitle, safeInitial].filter(Boolean).join('\n\n'),
      authorId: session.user.id,
    });
    if (!moderation.success) {
      throw new AppError(moderation.reason ?? 'Thread blocked by content filter', 'FORBIDDEN', 403);
    }

    const created = await prisma.$transaction(async (tx) => {
      const thread = await tx.thread.create({
        data: {
          name: safeTitle,
          description: null,
          slug: buildThreadSlug(safeTitle),
          createdBy: session.user.id,
          visibility: 'PUBLIC',
          messageCount: 1,
          messages: {
            create: {
              content: safeInitial,
              senderId: session.user.id,
              claims: {
                create: claimRows.map((c) => ({
                  position: c.position,
                  text: c.text,
                  status: c.status,
                  sourceId: c.sourceId,
                  sourceLabel: c.sourceLabel,
                  sourceUrl: c.sourceUrl,
                  excerpt: c.excerpt,
                  confidence: c.confidence,
                  confirmCount: 0,
                  disputeCount: 0,
                })),
              },
            },
          },
        },
        include: {
          messages: {
            select: { id: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      });
      return { thread, messageId: thread.messages[0]?.id ?? null };
    });

    if (!created.messageId) {
      throw new AppError('Failed to create verification message', 'INTERNAL_ERROR', 500);
    }

    infraThreadSideEffects.revalidateDashboard();
    return actionSuccess({ slug: created.thread.slug, threadId: created.thread.id, messageId: created.messageId });
  }
);

const voteClaimInput = z.object({
  claimId: z.string().cuid(),
  type: z.enum(['CONFIRM', 'DISPUTE']),
});

export const voteClaimAction = createServerAction(
  { schema: voteClaimInput, actionName: 'voteClaimAction' },
  async ({ claimId, type }) => {
    const session = await requireSessionOrThrow();
    const rl = await rateLimit({ key: `vote-claim:${session.user.id}`, type: 'message' });
    if (!rl.success) throw new AppError('Too many votes, slow down', 'RATE_LIMITED', 429);

    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      select: { id: true, message: { select: { threadId: true } } },
    });
    if (!claim || !claim.message) {
      throw new AppError('Claim not found', 'NOT_FOUND', 404);
    }

    await requireWriteOrThrow(claim.message.threadId, session.user.id, session.user.role);

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.claimVote.findUnique({
        where: { claimId_userId: { claimId, userId: session.user.id } },
        select: { type: true },
      });
      const current = await tx.claim.findUnique({
        where: { id: claimId },
        select: { confirmCount: true, disputeCount: true },
      });
      if (!current) throw new AppError('Claim not found', 'NOT_FOUND', 404);

      let confirmCount = current.confirmCount;
      let disputeCount = current.disputeCount;

      if (!existing) {
        await tx.claimVote.create({ data: { claimId, userId: session.user.id, type } });
        if (type === 'CONFIRM') confirmCount += 1;
        else disputeCount += 1;
      } else if (existing.type !== type) {
        await tx.claimVote.update({
          where: { claimId_userId: { claimId, userId: session.user.id } },
          data: { type },
        });
        if (existing.type === 'CONFIRM') confirmCount -= 1;
        else disputeCount -= 1;
        if (type === 'CONFIRM') confirmCount += 1;
        else disputeCount += 1;
      }

      const status = computeClaimStatus(confirmCount, disputeCount);
      const saved = await tx.claim.update({
        where: { id: claimId },
        data: { confirmCount, disputeCount, status },
        select: {
          id: true,
          messageId: true,
          position: true,
          text: true,
          status: true,
          sourceLabel: true,
          sourceUrl: true,
          excerpt: true,
          confidence: true,
          confirmCount: true,
          disputeCount: true,
        },
      });
      return saved;
    });

    return actionSuccess({ claim: toClaimSummary(updated) });
  }
);

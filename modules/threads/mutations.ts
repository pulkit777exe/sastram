import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { ThreadVisibility } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';
import { AppError } from '@/lib/utils/errors';
import { buildThreadSlug } from '@/modules/threads/slug';
import { dispatch } from '@/modules/notifications/dispatcher';
import { forkThread, updateThreadDetails } from './write';
import { infraThreadSideEffects } from './infra-effects';
import type { ThreadSideEffectsPort } from './side-effects';

/**
 * Canonical visibility enum — mirrors Prisma ThreadVisibility
 * (PUBLIC | PRIVATE | RESTRICTED). Edge schemas (routes / actions) should
 * reuse this instead of hand-rolling narrower z.enums so values like
 * RESTRICTED are never silently dropped.
 */
export const threadVisibilitySchema = z.enum(['PUBLIC', 'PRIVATE', 'RESTRICTED']);
export type ThreadVisibilityInput = z.infer<typeof threadVisibilitySchema>;

export const forkKindSchema = z.enum(['ASSUMPTION', 'CONTINUE', 'REMIX_AI', 'EXTERNAL']);
export type ForkKindInput = z.infer<typeof forkKindSchema>;

export const carryOverModeSchema = z.enum(['SUMMARY', 'SELECTED_MESSAGES', 'NONE']);
export type CarryOverModeInput = z.infer<typeof carryOverModeSchema>;

const MAX_SLUG_COUNTER_ATTEMPTS = 10;
const MAX_CARRY_OVER_CHARS = 4000;
const MAX_SELECTED_MESSAGES = 10;
const MAX_PREMISE_CHARS = 500;
const MAX_EXTERNAL_EXCERPT_CHARS = 500;
const MAX_EXTERNAL_ATTRIBUTION_CHARS = 200;
const MAX_SUPERSEDE_REASON_CHARS = 500;

function boundText(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function visibilityRank(v: ThreadVisibility): number {
  if (v === 'PRIVATE') return 0;
  if (v === 'RESTRICTED') return 1;
  return 2;
}

function assertVisibilityNotWidened(source: ThreadVisibility, fork: ThreadVisibility) {
  if (visibilityRank(fork) > visibilityRank(source)) {
    throw new AppError('Fork visibility cannot be wider than the source thread', 'FORBIDDEN', 403);
  }
}

/**
 * Counter-fallback slug uniqueness. buildThreadSlug already suffixes a uuid,
 * so collisions are rare; when they happen we try `-1`, `-2`, … before
 * falling back to a fresh short uuid suffix.
 */
export async function ensureUniqueSlug(
  baseSlug: string,
  sideEffects: ThreadSideEffectsPort = infraThreadSideEffects
): Promise<string> {
  if (!(await sideEffects.slugExists(baseSlug))) return baseSlug;
  for (let counter = 1; counter <= MAX_SLUG_COUNTER_ATTEMPTS; counter += 1) {
    const candidate = `${baseSlug}-${counter}`;
    if (!(await sideEffects.slugExists(candidate))) return candidate;
  }
  return `${baseSlug}-${randomUUID().slice(0, 8)}`;
}

export interface ForkThreadDomainArgs {
  sourceThreadId: string;
  title?: string | null;
  visibility?: ThreadVisibility;
  userId: string;
  forkKind?: ForkKindInput;
  forkPremise?: string | null;
  carryOverMode?: CarryOverModeInput;
  selectedMessageIds?: string[];
  sideEffects?: ThreadSideEffectsPort;
}

async function buildCarryOverSnapshot(args: {
  source: { id: string; aiSummary: string | null };
  mode: CarryOverModeInput;
  userId: string;
  userRole?: string | null;
  selectedMessageIds?: string[];
}): Promise<string | null> {
  if (args.mode === 'NONE') return null;
  if (args.mode === 'SUMMARY') {
    const summary = args.source.aiSummary?.trim();
    if (!summary) return null;
    return `AI summary snapshot:\n${summary.slice(0, MAX_CARRY_OVER_CHARS)}`;
  }
  const ids = Array.from(new Set((args.selectedMessageIds ?? []).filter(Boolean))).slice(0, MAX_SELECTED_MESSAGES);
  if (ids.length === 0) return null;
  // Access is already checked for source thread; fetch only messages from this thread.
  const messages = await prisma.message.findMany({
    where: { id: { in: ids }, threadId: args.source.id, deletedAt: null },
    select: { id: true, content: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: MAX_SELECTED_MESSAGES,
  });
  if (messages.length === 0) return null;
  let remaining = MAX_CARRY_OVER_CHARS;
  const parts: string[] = ['Selected messages snapshot:'];
  for (const m of messages) {
    if (remaining <= 0) break;
    const snippet = m.content.replace(/\s+/g, ' ').trim().slice(0, Math.min(500, remaining));
    parts.push(`- ${snippet}`);
    remaining -= snippet.length;
  }
  return parts.join('\n').slice(0, MAX_CARRY_OVER_CHARS);
}

async function notifyParentOpOnFork(parentThreadId: string, fork: { id: string; slug: string; name: string }, actorUserId: string) {
  const parent = await prisma.thread.findUnique({
    where: { id: parentThreadId },
    select: { createdBy: true },
  });
  const opId = parent?.createdBy;
  if (!opId || opId === actorUserId) return;
  await dispatch({
    recipients: { userIds: [opId] },
    category: 'SYSTEM',
    title: 'Your thread was forked',
    message: `"${fork.name}" was created from your thread.`,
    data: { kind: 'thread_fork', parentThreadId, forkThreadId: fork.id, forkSlug: fork.slug },
  });
}

/**
 * Domain fork: verify source, build a unique slug, create the fork row, copy
 * tags (reddit-style crosspost keeps tags). Auth + sanitization stay at the
 * edge (action / route); this op owns slug-uniqueness + tag-copy.
 */
export async function forkThreadDomain({
  sourceThreadId,
  title,
  visibility,
  userId,
  forkKind = 'CONTINUE',
  forkPremise,
  carryOverMode = 'SUMMARY',
  selectedMessageIds,
  sideEffects = infraThreadSideEffects,
}: ForkThreadDomainArgs): Promise<{ id: string; slug: string }> {
  // Read access is enforced by caller, but resolve source details here.
  const source = await prisma.thread.findUnique({
    where: { id: sourceThreadId, deletedAt: null },
    select: { id: true, name: true, description: true, visibility: true, createdBy: true, slug: true, aiSummary: true },
  });
  if (!source) throw new AppError('Thread not found', 'NOT_FOUND', 404);

  const rawTitle = title?.trim() ? title.trim().slice(0, 120) : `${source.name} (fork)`;
  const baseSlug = buildThreadSlug(rawTitle);
  const slug = await ensureUniqueSlug(baseSlug, sideEffects);

  const resolvedVisibility = visibility ?? source.visibility;
  assertVisibilityNotWidened(source.visibility, resolvedVisibility);

  // Description and tags are part of the source thread's private context.
  // Only carry them across when the source itself is public and visibility does not widen.
  const copySourceMetadata = source.visibility === 'PUBLIC' && resolvedVisibility === 'PUBLIC';

  const premise = boundText(forkPremise, MAX_PREMISE_CHARS);
  if ((forkKind === 'ASSUMPTION' || forkKind === 'REMIX_AI') && !premise) {
    // KISS: allow empty but prefer provided; do not hard-fail for legacy UX.
  }

  const snapshot = await buildCarryOverSnapshot({
    source: { id: source.id, aiSummary: source.aiSummary },
    mode: carryOverMode,
    userId,
    selectedMessageIds,
  });

  const descriptionParts: string[] = [];
  if (copySourceMetadata && source.description) descriptionParts.push(source.description.trim());
  if (premise) descriptionParts.push(`Premise: ${premise}`);
  if (snapshot) descriptionParts.push(snapshot);
  const description = descriptionParts.join('\n\n').slice(0, 8000) || null;

  const forked = await forkThread({
    name: rawTitle,
    description,
    slug,
    createdBy: userId,
    forkedFromId: source.id,
    visibility: resolvedVisibility,
    forkKind,
    forkPremise: premise,
    carryOverMode,
    carryOverSnapshot: snapshot,
  });

  if (copySourceMetadata) {
    await sideEffects.copyThreadTags(source.id, forked.id);
  }

  await notifyParentOpOnFork(source.id, { id: forked.id, slug: forked.slug, name: forked.name }, userId);
  return { id: forked.id, slug: forked.slug };
}

export interface CreateExternalForkDomainArgs {
  title: string;
  description?: string | null;
  initialMessage?: string;
  visibility?: ThreadVisibility;
  userId: string;
  sourceUrl: string;
  excerpt?: string | null;
  attribution?: string | null;
  forkPremise?: string | null;
  parentThreadId?: string | null;
  sideEffects?: ThreadSideEffectsPort;
}

/**
 * External-URL fork: same single-write path as forkThreadDomain, except the
 * tag-copy step is a deliberate no-op (an external URL has no source thread
 * to copy tags from). Visibility is set inline at create time — including
 * RESTRICTED — so there is no second update that a concurrent read could
 * observe half-applied.
 */
export async function createExternalForkDomain({
  title,
  description,
  initialMessage,
  visibility = 'PUBLIC',
  userId,
  sourceUrl,
  excerpt,
  attribution,
  forkPremise,
  parentThreadId,
  sideEffects = infraThreadSideEffects,
}: CreateExternalForkDomainArgs): Promise<{ id: string; slug: string }> {
  const name = title.trim().slice(0, 120);
  const slug = await ensureUniqueSlug(buildThreadSlug(name), sideEffects);
  const safeExcerpt = boundText(excerpt, MAX_EXTERNAL_EXCERPT_CHARS);
  const safeAttribution = boundText(attribution, MAX_EXTERNAL_ATTRIBUTION_CHARS);
  const premise = boundText(forkPremise, MAX_PREMISE_CHARS);

  let resolvedParentId: string | null = null;
  const resolvedVisibility = visibility;
  if (parentThreadId) {
    // If initiated from an in-app parent context, enforce read + visibility constraints.
    const parent = await prisma.thread.findUnique({
      where: { id: parentThreadId, deletedAt: null },
      select: { id: true, visibility: true },
    });
    if (parent) {
      resolvedParentId = parent.id;
      assertVisibilityNotWidened(parent.visibility, resolvedVisibility);
    }
  }

  const descriptionParts = [
    `Source: ${sourceUrl}`,
    safeAttribution ? `Attribution: ${safeAttribution}` : null,
    safeExcerpt ? `Excerpt: ${safeExcerpt}` : null,
    premise ? `Premise: ${premise}` : null,
    description?.trim() || null,
  ].filter(Boolean) as string[];

  const forked = await forkThread({
    name,
    description: descriptionParts.join('\n\n').slice(0, 8000),
    slug,
    createdBy: userId,
    forkedFromId: resolvedParentId,
    visibility: resolvedVisibility,
    forkKind: 'EXTERNAL',
    forkPremise: premise,
    carryOverMode: 'NONE',
    externalSourceUrl: sourceUrl,
    externalExcerpt: safeExcerpt,
    externalAttribution: safeAttribution,
  });

  if (initialMessage?.trim()) {
    await prisma.message.create({
      data: {
        threadId: forked.id,
        senderId: userId,
        content: initialMessage.trim().slice(0, 10000),
      },
    });
    await prisma.thread.update({ where: { id: forked.id }, data: { messageCount: { increment: 1 } } }).catch(() => {});
  }

  if (resolvedParentId) {
    await notifyParentOpOnFork(resolvedParentId, { id: forked.id, slug: forked.slug, name: forked.name }, userId);
  }

  return { id: forked.id, slug: forked.slug };
}

export interface UpdateThreadDomainArgs {
  threadId: string;
  name: string;
  description?: string | null;
  sideEffects?: ThreadSideEffectsPort;
}

/**
 * Rename a thread / edit its description. Verifies the thread exists, writes
 * through the repository, and revalidates via the port (no direct prisma or
 * next/cache calls at the edge).
 */
export async function updateThreadDomain({
  threadId,
  name,
  description,
  sideEffects = infraThreadSideEffects,
}: UpdateThreadDomainArgs): Promise<{ title: string; description: string | null; slug: string }> {
  const safeDescription = description ?? null;
  let slug: string;
  try {
    ({ slug } = await updateThreadDetails(threadId, { name, description: safeDescription }));
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2025') {
      throw new AppError('Thread not found', 'NOT_FOUND', 404);
    }
    throw error;
  }

  sideEffects.revalidateThreadPage(slug);
  sideEffects.revalidateDashboard();
  return { title: name, description: safeDescription, slug };
}

export async function proposeSupersedeDomain(args: {
  forkThreadId: string;
  userId: string;
  reason?: string | null;
}) {
  const fork = await prisma.thread.findUnique({
    where: { id: args.forkThreadId, deletedAt: null },
    select: { id: true, createdBy: true, forkedFromId: true, name: true, slug: true, supersedeStatus: true },
  });
  if (!fork || !fork.forkedFromId) throw new AppError('Fork not found', 'NOT_FOUND', 404);
  if (fork.createdBy !== args.userId) throw new AppError('Only the fork author can propose supersede', 'FORBIDDEN', 403);
  const reason = boundText(args.reason, MAX_SUPERSEDE_REASON_CHARS);
  await prisma.thread.update({
    where: { id: fork.id },
    data: {
      supersedeStatus: 'PROPOSED',
      supersedeReason: reason,
      supersedeProposedBy: args.userId,
      supersedeProposedAt: new Date(),
      supersedeDecidedBy: null,
      supersedeDecidedAt: null,
    },
  });
  const parent = await prisma.thread.findUnique({ where: { id: fork.forkedFromId }, select: { createdBy: true } });
  if (parent?.createdBy && parent.createdBy !== args.userId) {
    await dispatch({
      recipients: { userIds: [parent.createdBy] },
      category: 'SYSTEM',
      title: 'Supersede proposed for your thread',
      message: `A fork proposed to supersede your thread: "${fork.name}".`,
      data: { kind: 'supersede_proposed', parentThreadId: fork.forkedFromId, forkThreadId: fork.id, forkSlug: fork.slug },
    });
  }
  return { ok: true };
}

export async function decideSupersedeDomain(args: {
  forkThreadId: string;
  userId: string;
  userRole?: string | null;
  decision: 'ACCEPTED' | 'DECLINED';
  reason?: string | null;
}) {
  const fork = await prisma.thread.findUnique({
    where: { id: args.forkThreadId, deletedAt: null },
    select: { id: true, forkedFromId: true, name: true, slug: true, supersedeStatus: true },
  });
  if (!fork || !fork.forkedFromId) throw new AppError('Fork not found', 'NOT_FOUND', 404);
  const parent = await prisma.thread.findUnique({ where: { id: fork.forkedFromId, deletedAt: null }, select: { createdBy: true } });
  if (!parent) throw new AppError('Parent thread not found', 'NOT_FOUND', 404);
  const isParentOp = parent.createdBy === args.userId;
  const isModerator = args.userRole === 'MODERATOR' || args.userRole === 'ADMIN';
  if (!isParentOp && !isModerator) {
    throw new AppError('Only the parent thread owner or a moderator can decide supersede', 'FORBIDDEN', 403);
  }
  if (fork.supersedeStatus === 'NONE') {
    throw new AppError('No supersede proposal to decide', 'BAD_REQUEST', 400);
  }
  const reason = boundText(args.reason, MAX_SUPERSEDE_REASON_CHARS);
  await prisma.thread.update({
    where: { id: fork.id },
    data: {
      supersedeStatus: args.decision,
      supersedeDecidedBy: args.userId,
      supersedeDecidedAt: new Date(),
      ...(reason ? { supersedeReason: reason } : {}),
    },
  });
  return { ok: true };
}

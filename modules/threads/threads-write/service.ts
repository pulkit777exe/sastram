import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { ThreadVisibility } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';
import { AppError } from '@/lib/utils/errors';
import { buildThreadSlug } from '@/modules/threads/slug';
import { createThread, forkThread, updateThreadDetails } from './repository';
import { infraThreadSideEffects } from '../adapters/infra-side-effects';
import type { ThreadSideEffectsPort } from '../ports/side-effects';

/**
 * Canonical visibility enum — mirrors Prisma ThreadVisibility
 * (PUBLIC | PRIVATE | RESTRICTED). Edge schemas (routes / actions) should
 * reuse this instead of hand-rolling narrower z.enums so values like
 * RESTRICTED are never silently dropped.
 */
export const threadVisibilitySchema = z.enum(['PUBLIC', 'PRIVATE', 'RESTRICTED']);
export type ThreadVisibilityInput = z.infer<typeof threadVisibilitySchema>;

const MAX_SLUG_COUNTER_ATTEMPTS = 10;

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
  sideEffects?: ThreadSideEffectsPort;
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
  sideEffects = infraThreadSideEffects,
}: ForkThreadDomainArgs): Promise<{ id: string; slug: string }> {
  const source = await prisma.thread.findUnique({
    where: { id: sourceThreadId, deletedAt: null },
    select: { id: true, name: true, description: true, visibility: true, createdBy: true, slug: true },
  });
  if (!source) throw new AppError('Thread not found', 'NOT_FOUND', 404);

  const rawTitle = title?.trim() ? title.trim().slice(0, 120) : `${source.name} (fork)`;
  const baseSlug = buildThreadSlug(rawTitle);
  const slug = await ensureUniqueSlug(baseSlug, sideEffects);

  const forked = await forkThread({
    name: rawTitle,
    description: source.description,
    slug,
    createdBy: userId,
    forkedFromId: source.id,
    visibility: visibility ?? 'PUBLIC',
  });

  await sideEffects.copyThreadTags(source.id, forked.id);

  return { id: forked.id, slug: forked.slug };
}

export interface CreateExternalForkDomainArgs {
  title: string;
  description?: string | null;
  initialMessage?: string;
  visibility?: ThreadVisibility;
  userId: string;
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
  sideEffects = infraThreadSideEffects,
}: CreateExternalForkDomainArgs): Promise<{ id: string; slug: string }> {
  const name = title.trim().slice(0, 120);
  const slug = await ensureUniqueSlug(buildThreadSlug(name), sideEffects);

  const result = await createThread({
    name,
    description: description ?? null,
    slug,
    createdBy: userId,
    initialMessage,
    visibility,
  });

  return { id: result.thread.id, slug: result.thread.slug };
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

import { randomUUID } from 'crypto';
import { prisma } from '@/lib/infrastructure/prisma';
import { AppError } from '@/lib/utils/errors';
import { buildThreadSlug } from '@/modules/threads/slug';
import { validatePollExpiry as validatePollExpiryCanonical } from '@/modules/polls/validate';
import { forkThread } from './repository';
import { infraThreadSideEffects } from '../adapters/infra-side-effects';
import type { ThreadSideEffectsPort } from '../ports/side-effects';

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

/**
 * Shared poll-expiry guard — canonical implementation lives in
 * modules/polls/validate.ts. Re-exported here for backwards compatibility.
 *
 * Returns an error message when invalid, null when valid or empty.
 */
export function validatePollExpiry(expiresAt: Date | string | null | undefined): string | null {
  return validatePollExpiryCanonical(expiresAt);
}

export interface ForkThreadDomainArgs {
  sourceThreadId: string;
  title?: string | null;
  visibility?: 'PUBLIC' | 'PRIVATE' | 'RESTRICTED';
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

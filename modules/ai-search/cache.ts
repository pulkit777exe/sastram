import { prisma } from '@/lib/infrastructure/prisma';
import type { Prisma } from '@prisma/client';
import { logger } from '@/lib/infrastructure/logger';
import type { AISearchResponse } from './types';
import type { AISearchPipelineResult } from './service';
import { hashQuery } from './hash';

// Cache TTLs in seconds — tuned per query type.
const CACHE_TTL_SECONDS = {
  // Technical and factual queries change slowly; cache longer.
  LONG_TTL: 6 * 60 * 60, // 6 hours
  // Opinion/comparison queries are more volatile; cache shorter.
  SHORT_TTL: 60 * 60, // 1 hour
};

export async function getCachedResult(query: string): Promise<AISearchResponse | null> {
  const hash = hashQuery(query);

  try {
    const cached = await prisma.aiSearchResult.findFirst({
      where: { queryHash: hash, expiresAt: { gt: new Date() } },
    });

    if (!cached) return null;

    prisma.aiSearchResult
      .update({
        where: { id: cached.id },
        data: { hitCount: { increment: 1 } },
      })
      .catch((err) => {
        logger.error('[getCachedResult] failed to increment hit count', {
          error: err instanceof Error ? err.message : String(err),
          cacheId: cached.id,
        });
      });

    const result = JSON.parse(cached.synthesis) as unknown as AISearchResponse;

    if (
      !result?.synthesis?.content ||
      typeof result.synthesis.content !== 'string' ||
      result.synthesis.content.trim().length === 0
    ) {
      logger.debug('[getCachedResult] cached entry has empty/invalid synthesis, treating as miss', {
        cacheId: cached.id,
      });
      return null;
    }

    result.synthesis.cachedAt = cached.createdAt.toISOString();
    return result;
  } catch (err) {
    logger.error('[getCachedResult] cache lookup failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * KISS: single upsert for the system user, then single session lookup.
 * Seed creates id='anonymous', but upsert by email handles both cases.
 */
async function getOrCreateAnonymousSession() {
  let anonymousUserId = 'anonymous';
  try {
    const anonUser = await prisma.user.upsert({
      where: { email: 'system@sastram.internal' },
      update: {},
      create: { id: 'anonymous', email: 'system@sastram.internal', name: 'System' },
    });
    anonymousUserId = anonUser.id;
  } catch {
    // fallback — session create will handle FK error
  }

  let anonymousSession = await prisma.aiSearchSession.findFirst({
    where: { userId: anonymousUserId },
  });

  if (anonymousSession) {
    return anonymousSession;
  }

  try {
    anonymousSession = await prisma.aiSearchSession.create({
      data: {
        userId: anonymousUserId,
        query: '',
        queryHash: hashQuery(''),
      },
    });
    return anonymousSession;
  } catch (createErr) {
    const retry = await prisma.aiSearchSession.findFirst({ where: { userId: anonymousUserId } });
    if (retry) {
      return retry;
    }
    throw createErr;
  }
}

export async function cacheResult(
  query: string,
  result: AISearchPipelineResult,
  queryType: string
): Promise<void> {
  const hash = hashQuery(query);
  const isLongLived = queryType === 'technical' || queryType === 'factual';
  const ttlSeconds = isLongLived ? CACHE_TTL_SECONDS.LONG_TTL : CACHE_TTL_SECONDS.SHORT_TTL;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  try {
    const anonymousSession = await getOrCreateAnonymousSession();

    await prisma.aiSearchResult.create({
      data: {
        sessionId: anonymousSession.id,
        queryHash: hash,
        synthesis: result.synthesis.text || result.synthesis.content || JSON.stringify(result.synthesis),
        citations: (result.synthesis.citations ?? []) as unknown as Prisma.InputJsonValue,
        followUps: (result.followUps ?? []) as unknown as Prisma.InputJsonValue,
        expiresAt,
        sourceCount: result.sources?.length || 0,
        conflictFound: false,
        confidence: Math.round(result.synthesis.confidence ?? 0),
        sources: (result.sources ?? []) as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    logger.error('[cacheResult] cache write failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

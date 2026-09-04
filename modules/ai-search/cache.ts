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
 * Get or create the singleton anonymous session used for cache entries
 * that are not tied to a specific user. Read-then-write avoids
 * transaction pool exhaustion under load, and the retry handles
 * race conditions where two callers create concurrently.
 */
async function getOrCreateAnonymousSession() {
  let anonymousSession = await prisma.aiSearchSession.findFirst({
    where: { userId: 'anonymous' },
  });

  if (anonymousSession) {
    return anonymousSession;
  }

  try {
    anonymousSession = await prisma.aiSearchSession.create({
      data: {
        userId: 'anonymous',
        query: '',
        queryHash: hashQuery(''),
      },
    });
    return anonymousSession;
  } catch (createErr) {
    const retry = await prisma.aiSearchSession.findFirst({ where: { userId: 'anonymous' } });
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

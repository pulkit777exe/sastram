import { prisma } from '@/lib/infrastructure/prisma';
import type { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { logger } from '@/lib/infrastructure/logger';
import type { AISearchResponse } from './types';
import type { AISearchPipelineResult } from './service';

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

function hashQuery(query: string): string {
  return crypto.createHash('sha256').update(normalizeQuery(query)).digest('hex');
}

export async function getCachedResult(query: string): Promise<AISearchResponse | null> {
  const hash = hashQuery(query);

  try {
    const cached = await prisma.aiSearchResult.findFirst({
      where: { queryHash: hash, expiresAt: { gt: new Date() } },
    });

    if (!cached) return null;

    // Increment hit count asynchronously
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

    // Guard against serving a previously cached degraded/error result.
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
 * Store a result in the cache.
 */
export async function cacheResult(
  query: string,
  result: AISearchPipelineResult,
  queryType: string
): Promise<void> {
  const hash = hashQuery(query);

  // TTL: 6 hours for technical, 1 hour for opinion/news
  const ttlSeconds = queryType === 'technical' || queryType === 'factual' ? 6 * 60 * 60 : 60 * 60;

  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  try {
    // Get or create a single anonymous session for all cache entries.
    // Plain read-then-write (no transaction): the session is a singleton keyed
    // by userId 'anonymous', and a rare duplicate-create is harmless. Using a
    // transaction here held a pooled connection for the whole cascade and failed
    // under load with "Unable to start a transaction in the given time."
    let anonymousSession = await prisma.aiSearchSession.findFirst({
      where: { userId: 'anonymous' },
    });

    if (!anonymousSession) {
      try {
        anonymousSession = await prisma.aiSearchSession.create({
          data: {
            userId: 'anonymous',
            query: '', // placeholder query
            queryHash: hashQuery(''), // hash of empty string
          },
        });
      } catch (createErr) {
        // Another request may have created it concurrently — fall back to read.
        anonymousSession =
          (await prisma.aiSearchSession.findFirst({ where: { userId: 'anonymous' } })) ?? null;
        if (!anonymousSession) throw createErr;
      }
    }

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

/**
 * Cleanup expired cache entries. Can be called from a cron job.
 */
export async function cleanupExpiredCache(): Promise<number> {
  try {
    const result = await prisma.aiSearchResult.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  } catch (err) {
    logger.warn('[ai-search-cache] Failed to cleanup expired cache', { error: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

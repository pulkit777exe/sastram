import { prisma } from '@/lib/infrastructure/prisma';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { logger } from '@/lib/infrastructure/logger';
import type { AISearchResponse } from './types';

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
  result: AISearchResponse,
  queryType: string
): Promise<void> {
  const hash = hashQuery(query);

  // TTL: 6 hours for technical, 1 hour for opinion/news
  const ttlSeconds = queryType === 'technical' || queryType === 'factual' ? 6 * 60 * 60 : 60 * 60;

  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  try {
    // Get or create a single anonymous session for all cache entries
    // Use a transaction to avoid race condition with concurrent requests
    const anonymousSession = await prisma.$transaction(async (tx) => {
      let session = await tx.aiSearchSession.findFirst({
        where: { userId: 'anonymous' },
      });

      if (!session) {
        session = await tx.aiSearchSession.create({
          data: {
            userId: 'anonymous',
            query: '', // placeholder query
            queryHash: hashQuery(''), // hash of empty string
          },
        });
      }

      return session;
    });

    await prisma.aiSearchResult.create({
      data: {
        sessionId: anonymousSession.id,
        queryHash: hash,
        synthesis: JSON.stringify(result),
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
  } catch {
    return 0;
  }
}

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

export async function getCachedResult(query: string, expertiseLevel?: string): Promise<AISearchResponse | null> {
  const cacheKey = expertiseLevel ? `${query}:${expertiseLevel}` : query;
  const hash = hashQuery(cacheKey);

  try {
    const cached = await prisma.aiSearchResult.findFirst({
      where: { queryHash: hash, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
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

    // synthesis is stored as prose (string), not JSON — reconstruct without JSON.parse
    const synthesisText = cached.synthesis;
    if (!synthesisText || typeof synthesisText !== 'string' || synthesisText.trim().length === 0) {
      logger.debug('[getCachedResult] cached entry has empty/invalid synthesis, treating as miss', {
        cacheId: cached.id,
      });
      return null;
    }

    // Parse JSON fields robustly — handle both stringified and native object storage
    let sources: unknown = [];
    try {
      const raw = cached.sources as unknown;
      if (typeof raw === 'string') sources = JSON.parse(raw);
      else if (Array.isArray(raw)) sources = raw;
      else if (raw && typeof raw === 'object') sources = raw;
    } catch {
      sources = [];
    }

    let citations: unknown = [];
    try {
      const raw = (cached as unknown as { citations: unknown }).citations;
      if (typeof raw === 'string') citations = JSON.parse((raw as string) || '[]');
      else if (Array.isArray(raw)) citations = raw;
      else if (raw && typeof raw === 'object') citations = raw;
    } catch {
      citations = [];
    }

    let followUps: unknown = [];
    try {
      const raw = (cached as unknown as { followUps: unknown }).followUps;
      if (typeof raw === 'string') followUps = JSON.parse((raw as string) || '[]');
      else if (Array.isArray(raw)) followUps = raw;
      else if (raw && typeof raw === 'object') followUps = raw;
    } catch {
      followUps = [];
    }

    let conflictData: unknown = null;
    try {
      const raw = (cached as unknown as { conflictData: unknown }).conflictData;
      if (typeof raw === 'string' && (raw as string).length > 0) conflictData = JSON.parse(raw as string);
      else if (raw && typeof raw === 'object') conflictData = raw;
    } catch {
      conflictData = null;
    }
    if (!conflictData) {
      conflictData = { detected: (cached as unknown as { conflictFound: boolean }).conflictFound ?? false, description: '', sideA: '', sideB: '' };
    }

    const result = {
      synthesis: {
        content: synthesisText,
        text: synthesisText,
        citations,
        confidence: (cached as unknown as { confidence: number }).confidence ?? 0,
        sourceCount: (cached as unknown as { sourceCount: number }).sourceCount ?? (Array.isArray(sources) ? sources.length : 0),
        queryType: 'factual' as const,
        conflictData,
        processingTimeMs: 0,
        cachedAt: cached.createdAt.toISOString(),
      },
      sources,
      citations,
      followUps,
      phase: 'done' as const,
    } as unknown as AISearchResponse & { followUps: unknown; citations: unknown };

    return result as unknown as AISearchResponse;
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
  queryType: string,
  expertiseLevel?: string
): Promise<void> {
  const cacheKey = expertiseLevel ? `${query}:${expertiseLevel}` : query;
  const hash = hashQuery(cacheKey);
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
        conflictFound: result.synthesis.conflictData?.detected ?? false,
        conflictData: (result.synthesis.conflictData ?? null) as unknown as Prisma.InputJsonValue,
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

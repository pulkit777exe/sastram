// ─────────────────────────────────────────────────────────────
// AI Search — Prisma-backed Query Cache
// ─────────────────────────────────────────────────────────────

import { prisma } from "@/lib/infrastructure/prisma";
import { Prisma } from "@prisma/client";
import crypto from "crypto";
import type { AISearchResponse } from "./types";

/**
 * Normalize a query string for consistent hashing.
 */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * SHA-256 hash of a normalized query.
 */
function hashQuery(query: string): string {
  return crypto
    .createHash("sha256")
    .update(normalizeQuery(query))
    .digest("hex");
}

/**
 * Retrieve a cached result if it exists and hasn't expired.
 */
export async function getCachedResult(
  query: string,
): Promise<AISearchResponse | null> {
  const hash = hashQuery(query);

  try {
    const cached = await prisma.aiSearchCache.findUnique({
      where: { queryHash: hash },
    });

    if (!cached) return null;

    // Check expiry
    if (new Date() > cached.expiresAt) {
      // Cleanup expired entry asynchronously
      prisma.aiSearchCache.delete({ where: { id: cached.id } }).catch(() => {});
      return null;
    }

    // Increment hit count asynchronously
    prisma.aiSearchCache
      .update({
        where: { id: cached.id },
        data: { hitCount: { increment: 1 } },
      })
      .catch(() => {});

    const result = cached.resultJson as unknown as AISearchResponse;
    result.synthesis.cachedAt = cached.createdAt.toISOString();
    return result;
  } catch {
    return null;
  }
}

/**
 * Store a result in the cache.
 */
export async function cacheResult(
  query: string,
  result: AISearchResponse,
  queryType: string,
): Promise<void> {
  const hash = hashQuery(query);

  // TTL: 6 hours for technical, 1 hour for opinion/news
  const ttlSeconds =
    queryType === "technical" || queryType === "factual"
      ? 6 * 60 * 60
      : 60 * 60;

  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  try {
    await prisma.aiSearchCache.upsert({
      where: { queryHash: hash },
      update: {
        resultJson: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
        expiresAt,
        hitCount: 0,
      },
      create: {
        queryHash: hash,
        queryOriginal: query.substring(0, 500),
        resultJson: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
        expiresAt,
      },
    });
  } catch {
    // Caching is non-critical, don't crash the request
  }
}

/**
 * Record analytics for a search (no PII, no API keys).
 */
export async function recordSearchAnalytics(data: {
  queryHash?: string;
  queryType?: string;
  sourceCount?: number;
  confidenceScore?: number;
  processingMs?: number;
  usedCache?: boolean;
}): Promise<void> {
  try {
    await prisma.aiSearchAnalytics.create({
      data: {
        queryHash: data.queryHash || "",
        queryType: data.queryType,
        sourceCount: data.sourceCount,
        confidenceScore: data.confidenceScore,
        processingMs: data.processingMs,
        usedCache: data.usedCache || false,
      },
    });
  } catch {
    // Analytics is non-critical
  }
}

/**
 * Cleanup expired cache entries. Can be called from a cron job.
 */
export async function cleanupExpiredCache(): Promise<number> {
  try {
    const result = await prisma.aiSearchCache.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  } catch {
    return 0;
  }
}

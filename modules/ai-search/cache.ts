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
      .catch(() => {});

    const result = JSON.parse(cached.synthesis) as unknown as AISearchResponse;
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
    await prisma.aiSearchResult.upsert({
      where: { queryHash: hash },
      update: {
        synthesis: JSON.stringify(result),
        expiresAt,
        hitCount: 0,
      },
      create: {
        queryHash: hash,
        synthesis: JSON.stringify(result),
        expiresAt,
        sourceCount: result.sources?.length || 0,
        conflictFound: false,
      },
    });
  } catch {
    // Caching is non-critical, don't crash the request
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

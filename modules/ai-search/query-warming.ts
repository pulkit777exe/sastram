import { prisma } from '@/lib/infrastructure/prisma';
import { executeAISearch } from '@/modules/ai-search/service';
import { logger } from '@/lib/infrastructure/logger';
import { getEnv } from '@/lib/config/env';
import type { SearchConfig } from '@/modules/ai-search/types';

function isWarmingEnabled(): boolean {
  try {
    const envConfig = getEnv();
    if (!envConfig.SASTRAM_EXA_KEY || !envConfig.SASTRAM_TAVILY_KEY) {
      logger.warn('[query-warming] EXA/TAVILY keys missing — query warming disabled');
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

const FOLLOW_UP_PATTERNS = {
  technical: [
    'How to implement this',
    'Common mistakes to avoid',
    'Best practices',
    'Troubleshooting tips',
    'Performance optimization',
  ],
  factual: [
    'What are the alternatives',
    'How does this compare to',
    'Is this still relevant in',
    'What are the pros and cons',
    'How to verify this information',
  ],
  opinion: [
    'What do others think',
    'Expert opinions on',
    'Community consensus',
    'Potential biases',
    'Counterarguments to consider',
  ],
  comparison: [
    'Which one is better for',
    'Performance comparison',
    'Ease of use comparison',
    'Cost comparison',
    'Future trends',
  ],
};

const PREWARM_CONFIG = {
  maxFollowUpQueries: 3,
  minQueryLength: 5,
  recentSearchesWindow: 24 * 60 * 60 * 1000,
  cooldownPeriod: 15 * 60 * 1000,
};

function generateFollowUpQueries(originalQuery: string, queryType: string = 'technical'): string[] {
  const patterns =
    FOLLOW_UP_PATTERNS[queryType as keyof typeof FOLLOW_UP_PATTERNS] ||
    FOLLOW_UP_PATTERNS.technical;

  return patterns
    .slice(0, PREWARM_CONFIG.maxFollowUpQueries)
    .map((pattern) => `${pattern} ${originalQuery}`);
}

async function fetchRecentSessionsForWarming() {
  const recentSearches = await prisma.aiSearchSession.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - PREWARM_CONFIG.recentSearchesWindow) },
      OR: [
        { lastPrewarmedAt: null },
        { lastPrewarmedAt: { lt: new Date(Date.now() - PREWARM_CONFIG.cooldownPeriod) } },
      ],
    },
    select: { id: true, query: true, queryType: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  return recentSearches.filter((s) => s.query.length >= PREWARM_CONFIG.minQueryLength);
}

async function prewarmSingleSession(
  search: { id: string; query: string; queryType: string | null },
  stats: { prewarmed: number }
) {
  const followUpQueries = generateFollowUpQueries(search.query, search.queryType || 'technical');
  const envConfig = getEnv();
  const keys = {
    exa: envConfig.SASTRAM_EXA_KEY || '',
    tavily: envConfig.SASTRAM_TAVILY_KEY || '',
    gemini: envConfig.GEMINI_API_KEY || '',
  };
  if (!keys.exa || !keys.tavily || !keys.gemini) return;

  const config: SearchConfig = {
    searchMode: 'standard',
    exaMode: 'instant',
    tavilyMode: 'search',
    sourceFilter: 'all',
  };

  for (let i = 0; i < followUpQueries.length; i += 2) {
    const batch = followUpQueries.slice(i, i + 2);
    const results = await Promise.allSettled(batch.map((q) => executeAISearch(q, config, keys)));
    for (const r of results) {
      if (r.status === 'fulfilled') stats.prewarmed++;
      else logger.warn('[query-warming] follow-up failed', { error: (r as PromiseRejectedResult).reason });
    }
    await new Promise((res) => setTimeout(res, 800));
  }
  await prisma.aiSearchSession.update({ where: { id: search.id }, data: { lastPrewarmedAt: new Date() } });
}

export async function prewarmFollowUpQueries(): Promise<{
  processed: number;
  prewarmed: number;
  errors: number;
}> {
  const stats = { processed: 0, prewarmed: 0, errors: 0 };
  if (!isWarmingEnabled()) return stats;
  try {
    const filteredSearches = await fetchRecentSessionsForWarming();
    stats.processed = filteredSearches.length;
    for (const search of filteredSearches) {
      try {
        await prewarmSingleSession(search, stats);
      } catch (error) {
        logger.error(`Failed to pre-warm queries for search ${search.id}:`, error);
        stats.errors++;
      }
      await new Promise((res) => setTimeout(res, 500));
    }
  } catch (error) {
    logger.error('Failed to pre-warm follow-up queries:', error);
    stats.errors++;
  }
  return stats;
}


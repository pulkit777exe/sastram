import { prisma } from '@/lib/infrastructure/prisma';
import { executeAISearch } from '@/modules/ai-search/service';
import { createKeyedLlm } from '@/lib/ai/text';
import { searchWithExa, searchWithTavily } from '@/modules/ai-search/search-providers';
import { prismaSearchStore } from '@/modules/ai-search/cache';
import { enforceAiSpendCap } from '@/lib/services/ai-spend-cap';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { logger } from '@/lib/infrastructure/logger';
import { getEnv } from '@/lib/config/env';
import type { SearchConfig } from '@/modules/ai-search/types';
import type { SearchCtx, SearchStore } from '@/modules/ai-search/ports';

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

function buildWarmingCtx(keys: { exa: string; tavily: string; gemini: string }): SearchCtx {
  return {
    llm: createKeyedLlm({ gemini: keys.gemini }),
    search: {
      exa: (query, classification, config) => searchWithExa(query, classification, keys.exa, config),
      tavily: async (query, classification, config) => {
        const { sources, answer } = await searchWithTavily(query, classification, keys.tavily, config);
        return { sources, answer };
      },
    },
  };
}

type PrewarmOutcome = 'warmed' | 'cached' | 'capped';

/**
 * Warm one follow-up query: skip when already cached, stop when the spend cap
 * is hit, otherwise run the pipeline and persist the result for later hits.
 */
async function prewarmOneQuery(
  query: string,
  config: SearchConfig,
  ctx: SearchCtx,
  store: SearchStore
): Promise<PrewarmOutcome> {
  const cached = await store.get(query);
  if (cached) {
    return 'cached';
  }

  const spendCap = await enforceAiSpendCap(AiCallPath.QUERY_WARMING);
  if (!spendCap.allowed) {
    logger.warn('[query-warming] spend cap reached, skipping prewarm', { query });
    return 'capped';
  }

  const result = await executeAISearch(query, config, ctx);
  await store.put(query, result, result.synthesis.queryType);
  return 'warmed';
}

async function prewarmSingleSession(
  search: { id: string; query: string; queryType: string | null },
  stats: { prewarmed: number }
): Promise<boolean> {
  const followUpQueries = generateFollowUpQueries(search.query, search.queryType || 'technical');
  const envConfig = getEnv();
  const keys = {
    exa: envConfig.SASTRAM_EXA_KEY || '',
    tavily: envConfig.SASTRAM_TAVILY_KEY || '',
    gemini: envConfig.GEMINI_API_KEY || '',
  };
  if (!keys.exa || !keys.tavily || !keys.gemini) return false;

  const config: SearchConfig = {
    searchMode: 'standard',
    exaMode: 'instant',
    tavilyMode: 'search',
    sourceFilter: 'all',
  };
  const ctx = buildWarmingCtx(keys);
  const store = prismaSearchStore();

  let capped = false;
  for (let i = 0; i < followUpQueries.length; i += 2) {
    const batch = followUpQueries.slice(i, i + 2);
    const results = await Promise.allSettled(batch.map((q) => prewarmOneQuery(q, config, ctx, store)));
    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value === 'warmed') {
          stats.prewarmed++;
        } else if (r.value === 'capped') {
          capped = true;
        }
      } else {
        logger.warn('[query-warming] follow-up failed', { error: (r as PromiseRejectedResult).reason });
      }
    }
    if (capped) {
      return true;
    }
    await new Promise((res) => setTimeout(res, 800));
  }
  await prisma.aiSearchSession.update({ where: { id: search.id }, data: { lastPrewarmedAt: new Date() } });
  return false;
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
        const capped = await prewarmSingleSession(search, stats);
        if (capped) {
          logger.warn('[query-warming] stopping early: spend cap reached');
          break;
        }
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

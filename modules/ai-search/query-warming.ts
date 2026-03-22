import { prisma } from "@/lib/infrastructure/prisma";
import { executeAISearch } from "@/modules/ai-search/service";
import type { SearchConfig } from "@/modules/ai-search/types";

// Follow-up query patterns based on query type
const FOLLOW_UP_PATTERNS = {
  technical: [
    "How to implement this",
    "Common mistakes to avoid",
    "Best practices",
    "Troubleshooting tips",
    "Performance optimization",
  ],
  factual: [
    "What are the alternatives",
    "How does this compare to",
    "Is this still relevant in",
    "What are the pros and cons",
    "How to verify this information",
  ],
  opinion: [
    "What do others think",
    "Expert opinions on",
    "Community consensus",
    "Potential biases",
    "Counterarguments to consider",
  ],
  comparison: [
    "Which one is better for",
    "Performance comparison",
    "Ease of use comparison",
    "Cost comparison",
    "Future trends",
  ],
};

// Pre-warm configuration
const PREWARM_CONFIG = {
  maxFollowUpQueries: 3, // Number of follow-up queries to pre-warm per search
  minQueryLength: 5, // Minimum length of query to pre-warm
  recentSearchesWindow: 24 * 60 * 60 * 1000, // Look back 24 hours for recent searches
  cooldownPeriod: 15 * 60 * 1000, // Don't pre-warm the same query more than every 15 minutes
};

/**
 * Generates follow-up query suggestions based on original query and type
 */
function generateFollowUpQueries(originalQuery: string, queryType: string = "technical"): string[] {
  const patterns = FOLLOW_UP_PATTERNS[queryType as keyof typeof FOLLOW_UP_PATTERNS] || FOLLOW_UP_PATTERNS.technical;
  
  return patterns.slice(0, PREWARM_CONFIG.maxFollowUpQueries).map(pattern => 
    `${pattern} ${originalQuery}`
  );
}

/**
 * Pre-warms follow-up queries for recent searches
 */
export async function prewarmFollowUpQueries(): Promise<{
  processed: number;
  prewarmed: number;
  errors: number;
}> {
  const stats = { processed: 0, prewarmed: 0, errors: 0 };
  
  try {
    // Get recent search sessions that haven't been pre-warmed yet
    const recentSearches = await prisma.aiSearchSession.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - PREWARM_CONFIG.recentSearchesWindow),
        },
        OR: [
          { lastPrewarmedAt: null },
          { lastPrewarmedAt: { lt: new Date(Date.now() - PREWARM_CONFIG.cooldownPeriod) } },
        ],
      },
      include: {
        results: true,
      },
    });

    // Filter by query length
    const filteredSearches = recentSearches.filter(search => 
      search.query.length >= PREWARM_CONFIG.minQueryLength
    );

    stats.processed = filteredSearches.length;
    
    // Pre-warm follow-up queries for each recent search
    for (const search of filteredSearches) {
      try {
        const followUpQueries = generateFollowUpQueries(
          search.query,
          search.queryType || "technical"
        );

        // Execute follow-up searches
        for (const followUpQuery of followUpQueries) {
          const config: SearchConfig = {
            searchMode: "standard",
            exaMode: "instant",
            tavilyMode: "search",
            sourceFilter: "all",
          };

          // Get API keys from environment (fallback to dummy values if not available)
          const keys = {
            exa: process.env.EXA_API_KEY || "",
            tavily: process.env.TAVILY_API_KEY || "",
            gemini: process.env.GEMINI_API_KEY || "",
          };

          // Only execute if we have all necessary keys
          if (keys.exa && keys.tavily && keys.gemini) {
            await executeAISearch(followUpQuery, config, keys);
            stats.prewarmed++;
          }
        }

        // Update last pre-warmed time
        await prisma.aiSearchSession.update({
          where: { id: search.id },
          data: { lastPrewarmedAt: new Date() },
        });
      } catch (error) {
        console.error(`Failed to pre-warm queries for search ${search.id}:`, error);
        stats.errors++;
      }
    }
  } catch (error) {
    console.error("Failed to pre-warm follow-up queries:", error);
    stats.errors++;
  }

  return stats;
}

/**
 * Pre-warms queries based on user activity (e.g., visiting a thread)
 */
export async function prewarmQueriesForThread(threadId: string): Promise<{
  processed: number;
  prewarmed: number;
  errors: number;
}> {
  const stats = { processed: 0, prewarmed: 0, errors: 0 };
  
  try {
    // Get thread information
    const thread = await prisma.section.findUnique({
      where: { id: threadId },
      include: {
        messages: true,
        tags: true,
      },
    });

    if (!thread) {
      return stats;
    }

    // Extract keywords from thread name and messages
    const keywords = new Set<string>();
    keywords.add(thread.name);
    thread.messages.slice(0, 5).forEach(msg => {
      const words = msg.content.split(/\s+/).filter(word => word.length > 3);
      words.slice(0, 10).forEach(word => keywords.add(word));
    });

    // Generate queries from keywords
    const queries = Array.from(keywords).slice(0, 5).map(keyword => 
      `How to ${keyword}`
    );

    // Execute queries
    const config: SearchConfig = {
      searchMode: "standard",
      exaMode: "instant",
      tavilyMode: "search",
      sourceFilter: "all",
    };

    const keys = {
      exa: process.env.EXA_API_KEY || "",
      tavily: process.env.TAVILY_API_KEY || "",
      gemini: process.env.GEMINI_API_KEY || "",
    };

    if (keys.exa && keys.tavily && keys.gemini) {
      for (const query of queries) {
        try {
          await executeAISearch(query, config, keys);
          stats.prewarmed++;
        } catch (error) {
          console.error(`Failed to pre-warm query "${query}":`, error);
          stats.errors++;
        }
        stats.processed++;
      }
    }
  } catch (error) {
    console.error(`Failed to pre-warm queries for thread ${threadId}:`, error);
    stats.errors++;
  }

  return stats;
}

/**
 * Checks if a query has been pre-warmed
 */
export async function isQueryPrewarmed(query: string): Promise<boolean> {
  // Check if there's a recent search session for this query
  const normalizedQuery = query.trim().toLowerCase();
  
  const search = await prisma.aiSearchSession.findFirst({
    where: {
      queryHash: normalizedQuery,
      createdAt: {
        gte: new Date(Date.now() - PREWARM_CONFIG.recentSearchesWindow),
      },
    },
  });

  return !!search;
}

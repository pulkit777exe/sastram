import { getEnv } from '@/lib/config/env';
import { logger } from '@/lib/infrastructure/logger';
import { cleanJsonText } from '@/lib/ai/helpers';
import type { LlmAdapter } from './ports';
import type { QueryClassification } from './types';

// Re-exported so existing importers (and the failover test) keep working —
// the implementation now lives in lib/ai/text.ts.
export { generateText, createKeyedLlm } from '@/lib/ai/text';
export type { GenOptions, KeyedLlmKeys } from '@/lib/ai/text';

export async function classifyQuery(query: string, llm: LlmAdapter): Promise<QueryClassification> {
  const model = getEnv().GEMINI_LITE_MODEL;

  const prompt = `Classify this forum search query into ONE category:
- factual: has a single correct answer
- opinion: needs community consensus mapping
- technical: debugging/how-to/implementation
- comparison: comparing multiple options

Also identify:
- primaryDomain: 'programming' | 'devops' | 'general' | 'science' | 'design' | 'other'
- suggestedSources: array of best source domains to search
- searchTerms: 3 optimized search variants of the query
- isControversial: boolean

Query: "${query}"

Respond ONLY with valid JSON. No markdown, no code blocks, no explanation.
Schema: { "type": string, "primaryDomain": string, "suggestedSources": string[], "searchTerms": string[], "isControversial": boolean }`;

  try {
    const text = await llm.generateText(prompt, { model });
    return JSON.parse(cleanJsonText(text)) as QueryClassification;
  } catch (err) {
    logger.warn('[ai-search] classifyQuery failed, using technical fallback', {
      query,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      type: 'technical',
      primaryDomain: 'programming',
      suggestedSources: ['stackoverflow.com', 'github.com'],
      searchTerms: [query],
      isControversial: false,
    };
  }
}

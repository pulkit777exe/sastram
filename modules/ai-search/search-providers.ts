import { v4 as uuidv4 } from 'uuid';
import { withRetry } from '@/lib/utils/retry';
import { logger } from '@/lib/infrastructure/logger';
import type { SearchConfig, QueryClassification, Source, RawSearchResults } from './types';

const TIER_1_DOMAINS = [
  'wiki.archlinux.org',
  'developer.mozilla.org',
  'docs.python.org',
  'learn.microsoft.com',
  'docs.oracle.com',
  'docs.rs',
  'doc.rust-lang.org',
  'go.dev',
  'reactjs.org',
  'nextjs.org',
  'nodejs.org',
  'kubernetes.io',
  'man7.org',
  'docs.docker.com',
  'tailwindcss.com',
  'vuejs.org',
  'svelte.dev',
  'angular.dev',
  'flutter.dev',
  'w3schools.com',
  'web.dev',
];

const TIER_2_DOMAINS = [
  'stackoverflow.com',
  'news.ycombinator.com',
  'github.com',
  'serverfault.com',
  'superuser.com',
  'askubuntu.com',
  'reuters.com',
  'apnews.com',
  'bbc.com',
  'nytimes.com',
  'washingtonpost.com',
  'theguardian.com',
  'economist.com',
  'ft.com',
  'wsj.com',
  'apmreports.org',
  'indianexpress.com',
  'thehindu.com',
  'livemint.com',
  'theprint.in',
  'scroll.in',
  'thewire.in',
  'newslaundry.com',
  'altnews.in',
  'factchecker.in',
];

const TIER_3_DOMAINS = [
  'reddit.com',
  'quora.com',
  'lobste.rs',
  'dw.com',
  'aljazeera.com',
  'npr.org',
  'pbs.org',
  'youtube.com',
  'newsclick.in',
  'counterview.net',
  'sundayguardianlive.com',
  'genocidewatch.com',
  'thepolisproject.com',
];

export function getIncludeDomains(filter: SearchConfig['sourceFilter']): string[] | undefined {
  switch (filter) {
    case 'technical':
      return [
        'stackoverflow.com',
        'wiki.archlinux.org',
        'github.com',
        'developer.mozilla.org',
        'docs.python.org',
        'learn.microsoft.com',
      ];
    case 'reddit-hn':
      return ['reddit.com', 'news.ycombinator.com'];
    case 'docs':
      return [
        'wiki.archlinux.org',
        'developer.mozilla.org',
        'docs.python.org',
        'learn.microsoft.com',
        'docs.rs',
        'go.dev',
      ];
    case 'all':
    default:
      return undefined;
  }
}

export function assignTier(domain: string): 1 | 2 | 3 | 4 {
  const d = domain.toLowerCase().replace(/^www\./, '');
  if (TIER_1_DOMAINS.some((t) => d.includes(t))) return 1;
  if (TIER_2_DOMAINS.some((t) => d.includes(t))) return 2;
  if (TIER_3_DOMAINS.some((t) => d.includes(t))) return 3;
  return 4;
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

export function isOutdated(publishedDate?: string): boolean {
  if (!publishedDate) return false;
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  return new Date(publishedDate) < twoYearsAgo;
}

function getConfidenceForTier(tier: 1 | 2 | 3 | 4): number {
  if (tier === 1) return 90;
  if (tier === 2) return 75;
  if (tier === 3) return 60;
  return 45;
}

function buildExaBody(query: string, classification: QueryClassification, config: SearchConfig): Record<string, unknown> {
  const searchQuery = classification.searchTerms[0] ?? query;
  const body: Record<string, unknown> = {
    query: searchQuery,
    type: config.exaMode === 'instant' ? 'keyword' : 'neural',
    numResults: 8,
    text: { maxCharacters: 8000 },
    useAutoprompt: true,
  };
  const includeDomains = getIncludeDomains(config.sourceFilter);
  if (includeDomains) body.includeDomains = includeDomains;
  return body;
}

function mapExaResult(r: { id?: string; title?: string; url?: string; text?: string; publishedDate?: string }): Source {
  const domain = extractDomain(r.url || '');
  const tier = assignTier(domain);
  return {
    id: r.id || uuidv4(),
    title: r.title || 'Untitled',
    url: r.url || '',
    domain,
    snippet: (r.text || '').substring(0, 300),
    text: r.text || '',
    publishedDate: r.publishedDate,
    tier,
    confidence: getConfidenceForTier(tier),
    isOutdated: isOutdated(r.publishedDate),
    provider: 'exa' as const,
    contentFetched: Boolean(r.text && r.text.trim().length > 0),
  };
}

export async function searchWithExa(
  query: string,
  classification: QueryClassification,
  exaKey: string,
  config: SearchConfig
): Promise<Source[]> {
  try {
    const body = buildExaBody(query, classification, config);
    const data = await withRetry(async (signal) => {
      const response = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': exaKey },
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) throw new Error(`Exa API error: ${response.status}`);
      return response.json();
    });
    const results = data.results || [];
    return results.map(mapExaResult);
  } catch (error) {
    logger.error('Exa search failed:', error);
    return [];
  }
}

function buildTavilyBody(query: string, classification: QueryClassification, config: SearchConfig): Record<string, unknown> {
  const searchQuery = classification.searchTerms[0] ?? query;
  const body: Record<string, unknown> = {
    query: searchQuery,
    search_depth: config.tavilyMode === 'research' ? 'advanced' : 'basic',
    max_results: 6,
    include_answer: true,
  };
  const includeDomains = getIncludeDomains(config.sourceFilter);
  if (includeDomains) body.include_domains = includeDomains;
  return body;
}

function mapTavilyResult(r: {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string;
  score?: number;
}): Source {
  const domain = extractDomain(r.url || '');
  const tier = assignTier(domain);
  return {
    id: uuidv4(),
    title: r.title || 'Untitled',
    url: r.url || '',
    domain,
    snippet: (r.content || '').substring(0, 300),
    text: r.content || '',
    publishedDate: r.published_date,
    tier,
    confidence: Math.round((r.score || 0.5) * 100),
    isOutdated: isOutdated(r.published_date),
    provider: 'tavily' as const,
    contentFetched: Boolean(r.content && r.content.trim().length > 0),
  };
}

export async function searchWithTavily(
  query: string,
  classification: QueryClassification,
  tavilyKey: string,
  config: SearchConfig
): Promise<{ sources: Source[]; answer?: string }> {
  try {
    const body = buildTavilyBody(query, classification, config);
    const data = await withRetry(async (signal) => {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tavilyKey}` },
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) throw new Error(`Tavily API error: ${response.status}`);
      return response.json();
    });
    const results = data.results || [];
    const sources: Source[] = results.map(mapTavilyResult);
    return { sources, answer: data.answer };
  } catch (error) {
    logger.error('Tavily search failed:', error);
    return { sources: [] };
  }
}

export async function searchSources(
  query: string,
  classification: QueryClassification,
  exaKey: string,
  tavilyKey: string,
  config: SearchConfig
): Promise<RawSearchResults> {
  const exaPromise = searchWithExa(query, classification, exaKey, config);
  const tavilyPromise = searchWithTavily(query, classification, tavilyKey, config);
  const [exaResult, tavilyResult] = await Promise.allSettled([exaPromise, tavilyPromise]);

  const exaSources = exaResult.status === 'fulfilled' ? exaResult.value : [];
  const tavilySources = tavilyResult.status === 'fulfilled' ? tavilyResult.value.sources : [];
  const tavilyAnswer = tavilyResult.status === 'fulfilled' ? tavilyResult.value.answer : undefined;

  return { exaSources, tavilySources, tavilyAnswer };
}

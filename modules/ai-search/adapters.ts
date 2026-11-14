import { v4 as uuidv4 } from 'uuid';
import { searchThreads, searchMessages } from '@/modules/search/repository';
import { sanitizeSearchQuery } from './sanitize';
import type { SearchSource, SourceSearchContext } from './source-types';
import type { SearchMode, Source } from './types';
import { searchWithExa, searchWithTavily, extractDomain, isOutdated } from './search-providers';

const MAX_SNIPPET = 300;
const MAX_TEXT = 6000;
const HOSTILE_STRIP = /```[\s\S]*?```|<[^>]+>|(?:^|\n)\s*(system|developer|assistant)\s*:/gi;

function sanitizeExternalText(input: string | undefined | null, max = MAX_TEXT): string {
  const raw = (input ?? '').replace(/\u0000/g, '').slice(0, max * 2);
  const stripped = raw.replace(HOSTILE_STRIP, ' ').replace(/\s+/g, ' ').trim();
  return stripped.slice(0, max);
}

function makeSource(partial: Partial<Source> & Pick<Source, 'title' | 'url' | 'provider' | 'tier' | 'tierLabel'>): Source {
  const url = partial.url || '';
  const domain = partial.domain || extractDomain(url);
  const text = sanitizeExternalText(partial.text ?? partial.snippet ?? '', MAX_TEXT);
  const snippet = sanitizeExternalText(partial.snippet ?? text, MAX_SNIPPET);
  return {
    id: partial.id || uuidv4(),
    title: (partial.title || 'Untitled').slice(0, 200),
    url,
    domain,
    snippet,
    text,
    publishedDate: partial.publishedDate,
    tier: partial.tier,
    confidence: Math.max(0, Math.min(100, Math.round(partial.confidence ?? (partial.tier === 1 ? 90 : 60)))),
    isOutdated: partial.isOutdated ?? isOutdated(partial.publishedDate),
    provider: partial.provider,
    sourceLabel: partial.sourceLabel,
    tierLabel: partial.tierLabel,
    contentFetched: Boolean(text && text.trim().length > 0),
  };
}

function modeRank(mode: SearchMode): number {
  if (mode === 'quick' || mode === 'instant') return 0;
  if (mode === 'deep' || mode === 'advanced') return 2;
  return 1; // pro/standard/table
}

function baseEnabled(ctx: SourceSearchContext, minMode: SearchMode = 'pro'): boolean {
  return modeRank(ctx.mode) >= modeRank(minMode);
}

async function safeJson<T>(res: Response): Promise<T | null> {
  try { return (await res.json()) as T; } catch { return null; }
}

const SastramSource: SearchSource = {
  key: 'sastram',
  label: 'Sastram',
  tierLabel: 'Sastram',
  timeoutMs: 5000,
  enabled: () => true,
  async search(ctx) {
    const q = sanitizeSearchQuery(ctx.query).slice(0, 200);
    if (!q) return [];
    const limit = modeRank(ctx.mode) >= 2 ? 8 : modeRank(ctx.mode) >= 1 ? 5 : 3;
    const role = ctx.viewerRole as 'USER' | 'MODERATOR' | 'ADMIN' | null | undefined;
    const [threadsRes, messagesRes] = await Promise.allSettled([
      searchThreads(q, limit, 0, undefined, ctx.viewerUserId, role),
      searchMessages(q, undefined, limit, 0, ctx.viewerUserId, role),
    ]);
    const out: Source[] = [];
    if (threadsRes.status === 'fulfilled') {
      for (const t of threadsRes.value.threads as Array<{ id: string; name: string; slug: string; description?: string | null; aiSummary?: string | null; resolutionScore?: number | null; updatedAt?: Date | string }>) {
        const url = `/dashboard/threads/${t.slug}`;
        const text = sanitizeExternalText([t.aiSummary, t.description].filter(Boolean).join('\n\n') || t.name, 4000);
        out.push(makeSource({
          id: `sastram:thread:${t.id}`,
          title: t.name,
          url,
          domain: 'sastram.app',
          snippet: text.slice(0, 300),
          text,
          tier: 1,
          confidence: Math.min(95, 80 + Math.round((t.resolutionScore ?? 0) / 5)),
          provider: 'sastram',
          sourceLabel: 'Sastram thread',
          tierLabel: 'Sastram',
          publishedDate: t.updatedAt ? new Date(t.updatedAt).toISOString() : undefined,
          contentFetched: Boolean(text),
        }));
      }
    }
    if (messagesRes.status === 'fulfilled') {
      for (const m of (messagesRes.value as { messages: Array<{ id: string; content: string; thread?: { slug?: string; name?: string }; createdAt?: Date | string }> }).messages) {
        const slug = m.thread?.slug;
        if (!slug) continue;
        const url = `/dashboard/threads/${slug}#message-${m.id}`;
        const text = sanitizeExternalText(m.content, 1200);
        if (!text) continue;
        out.push(makeSource({
          id: `sastram:message:${m.id}`,
          title: m.thread?.name ? `Message in ${m.thread.name}` : 'Sastram message',
          url,
          domain: 'sastram.app',
          snippet: text.slice(0, 300),
          text,
          tier: 1,
          confidence: 70,
          provider: 'sastram',
          sourceLabel: 'Sastram message',
          tierLabel: 'Sastram',
          publishedDate: m.createdAt ? new Date(m.createdAt).toISOString() : undefined,
          contentFetched: true,
        }));
      }
    }
    return out;
  },
};

const ExaSource: SearchSource = {
  key: 'exa',
  label: 'Exa (web)',
  tierLabel: 'Web',
  timeoutMs: 12000,
  enabled: (ctx) => Boolean(ctx.keys?.exa),
  async search(ctx) {
    if (!ctx.keys?.exa) return [];
    const list = await searchWithExa(ctx.query, ctx.classification, ctx.keys.exa, ctx.config, ctx.signal);
    return list.map((s) => makeSource({ ...s, provider: 'exa', sourceLabel: 'Web (Exa)', tierLabel: 'Web' }));
  },
};

const TavilySource: SearchSource = {
  key: 'tavily',
  label: 'Tavily (web)',
  tierLabel: 'Web',
  timeoutMs: 12000,
  enabled: (ctx) => Boolean(ctx.keys?.tavily) && ctx.mode !== 'quick' && ctx.mode !== 'instant',
  async search(ctx) {
    if (!ctx.keys?.tavily) return [];
    const { sources } = await searchWithTavily(ctx.query, ctx.classification, ctx.keys.tavily, ctx.config, ctx.signal);
    return sources.map((s) => makeSource({ ...s, provider: 'tavily', sourceLabel: 'Web (Tavily)', tierLabel: 'Web' }));
  },
};

const HackerNewsSource: SearchSource = {
  key: 'hn',
  label: 'Hacker News',
  tierLabel: 'Community',
  timeoutMs: 6000,
  enabled: (ctx) => baseEnabled(ctx, 'pro'),
  async search(ctx) {
    const q = encodeURIComponent(sanitizeSearchQuery(ctx.query).slice(0, 120));
    const hits = modeRank(ctx.mode) >= 2 ? 8 : 5;
    const res = await fetch(`https://hn.algolia.com/api/v1/search?query=${q}&tags=story&hitsPerPage=${hits}`, { signal: ctx.signal });
    if (!res.ok) return [];
    const data = await safeJson<{ hits?: Array<{ objectID: string; title?: string; url?: string; story_text?: string; created_at?: string; points?: number; author?: string }> }>(res);
    return (data?.hits ?? []).map((h) => {
      const url = h.url || `https://news.ycombinator.com/item?id=${h.objectID}`;
      const text = sanitizeExternalText(h.story_text || h.title || '', 2000);
      return makeSource({
        id: `hn:${h.objectID}`,
        title: h.title || 'Hacker News discussion',
        url,
        domain: extractDomain(url) || 'news.ycombinator.com',
        snippet: text.slice(0, 300),
        text: text || sanitizeExternalText(h.title, 300),
        tier: 2,
        confidence: 70,
        provider: 'hn',
        sourceLabel: 'Hacker News',
        tierLabel: 'Community',
        publishedDate: h.created_at,
        contentFetched: Boolean(h.story_text),
      });
    });
  },
};

const StackExchangeSource: SearchSource = {
  key: 'stackexchange',
  label: 'Stack Exchange',
  tierLabel: 'Community',
  timeoutMs: 7000,
  enabled: (ctx) => baseEnabled(ctx, 'pro'),
  async search(ctx) {
    const q = encodeURIComponent(sanitizeSearchQuery(ctx.query).slice(0, 120));
    const pagesize = modeRank(ctx.mode) >= 2 ? 8 : 5;
    const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${q}&site=stackoverflow&pagesize=${pagesize}&filter=withbody`;
    const res = await fetch(url, { signal: ctx.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await safeJson<{ items?: Array<{ question_id: number; title?: string; link?: string; body_markdown?: string; body?: string; creation_date?: number; score?: number }> }>(res);
    return (data?.items ?? []).map((it) => {
      const body = sanitizeExternalText(it.body_markdown || it.body || '', 4000);
      const created = it.creation_date ? new Date(it.creation_date * 1000).toISOString() : undefined;
      return makeSource({
        id: `se:${it.question_id}`,
        title: (it.title || 'Stack Overflow question').replace(/&#?\w+;/g, ' '),
        url: it.link || `https://stackoverflow.com/q/${it.question_id}`,
        domain: 'stackoverflow.com',
        snippet: body.slice(0, 300),
        text: body,
        tier: 2,
        confidence: 75,
        provider: 'stackexchange',
        sourceLabel: 'Stack Overflow',
        tierLabel: 'Community',
        publishedDate: created,
        contentFetched: Boolean(body),
      });
    });
  },
};

const GitHubSource: SearchSource = {
  key: 'github',
  label: 'GitHub',
  tierLabel: 'Community',
  timeoutMs: 7000,
  enabled: (ctx) => baseEnabled(ctx, 'pro'),
  async search(ctx) {
    const q = encodeURIComponent(sanitizeSearchQuery(ctx.query).slice(0, 100));
    const per = modeRank(ctx.mode) >= 2 ? 6 : 4;
    const res = await fetch(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${per}`, {
      signal: ctx.signal,
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'sastram-ai-search' },
    });
    if (!res.ok) return [];
    const data = await safeJson<{ items?: Array<{ id: number; full_name?: string; html_url?: string; description?: string; updated_at?: string; stargazers_count?: number }> }>(res);
    return (data?.items ?? []).map((r) => {
      const text = sanitizeExternalText(r.description || r.full_name || '', 1200);
      return makeSource({
        id: `gh:${r.id}`,
        title: r.full_name || 'GitHub repository',
        url: r.html_url || 'https://github.com',
        domain: 'github.com',
        snippet: text.slice(0, 300),
        text,
        tier: 2,
        confidence: 70,
        provider: 'github',
        sourceLabel: 'GitHub',
        tierLabel: 'Community',
        publishedDate: r.updated_at,
        contentFetched: Boolean(text),
      });
    });
  },
};

const ArxivSource: SearchSource = {
  key: 'arxiv',
  label: 'arXiv',
  tierLabel: 'Academic',
  timeoutMs: 8000,
  enabled: (ctx) => modeRank(ctx.mode) >= 2 || (ctx.classification.type === 'technical' || ctx.classification.type === 'factual'),
  async search(ctx) {
    const q = encodeURIComponent(sanitizeSearchQuery(ctx.query).slice(0, 120));
    const max = modeRank(ctx.mode) >= 2 ? 6 : 3;
    const res = await fetch(`https://export.arxiv.org/api/query?search_query=all:${q}&start=0&max_results=${max}&sortBy=relevance`, { signal: ctx.signal });
    if (!res.ok) return [];
    const xml = await res.text();
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
    return entries.map((e) => {
      const idMatch = e.match(/<id>(.*?)<\/id>/);
      const title = (e.match(/<title>([\s\S]*?)<\/title>/)?.[1] || 'arXiv paper').replace(/\s+/g, ' ').trim();
      const summary = sanitizeExternalText((e.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] || '').replace(/\s+/g, ' '), 4000);
      const published = e.match(/<published>(.*?)<\/published>/)?.[1];
      const url = (idMatch?.[1] || '').trim();
      return makeSource({
        id: `arxiv:${url || uuidv4()}`,
        title,
        url: url || 'https://arxiv.org',
        domain: 'arxiv.org',
        snippet: summary.slice(0, 300),
        text: summary,
        tier: 2,
        confidence: 75,
        provider: 'arxiv',
        sourceLabel: 'arXiv',
        tierLabel: 'Academic',
        publishedDate: published,
        contentFetched: Boolean(summary),
      });
    });
  },
};

const WikipediaSource: SearchSource = {
  key: 'wikipedia',
  label: 'Wikipedia',
  tierLabel: 'Reference',
  timeoutMs: 6000,
  enabled: (ctx) => modeRank(ctx.mode) >= 1 || ctx.classification.type === 'factual',
  async search(ctx) {
    const q = encodeURIComponent(sanitizeSearchQuery(ctx.query).slice(0, 120));
    const limit = modeRank(ctx.mode) >= 2 ? 5 : 3;
    const res = await fetch(`https://en.wikipedia.org/w/rest.php/v1/search/title?q=${q}&limit=${limit}`, {
      signal: ctx.signal,
      headers: { 'Api-User-Agent': 'sastram-ai-search/1.0 (educational; contact: dev@sastram.app)' },
    });
    if (!res.ok) return [];
    const data = await safeJson<{ pages?: Array<{ id: number; key: string; title?: string; description?: string; excerpt?: string }> }>(res);
    return (data?.pages ?? []).map((p) => {
      const text = sanitizeExternalText((p.excerpt || p.description || '').replace(/<[^>]+>/g, ' '), 1200);
      const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(p.key)}`;
      return makeSource({
        id: `wiki:${p.id}`,
        title: p.title || p.key,
        url,
        domain: 'en.wikipedia.org',
        snippet: text.slice(0, 300),
        text,
        tier: 3,
        confidence: 65,
        provider: 'wikipedia',
        sourceLabel: 'Wikipedia',
        tierLabel: 'Reference',
        contentFetched: Boolean(text),
      });
    });
  },
};

const WikidataSource: SearchSource = {
  key: 'wikidata',
  label: 'Wikidata',
  tierLabel: 'Reference',
  timeoutMs: 6000,
  enabled: (ctx) => modeRank(ctx.mode) >= 2,
  async search(ctx) {
    const q = encodeURIComponent(sanitizeSearchQuery(ctx.query).slice(0, 120));
    const limit = modeRank(ctx.mode) >= 2 ? 5 : 3;
    const res = await fetch(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${q}&language=en&format=json&origin=*&limit=${limit}`, { signal: ctx.signal });
    if (!res.ok) return [];
    const data = await safeJson<{ search?: Array<{ id: string; label?: string; description?: string; concepturi?: string }> }>(res);
    return (data?.search ?? []).map((e) => {
      const text = sanitizeExternalText(e.description || e.label || '', 800);
      return makeSource({
        id: `wikidata:${e.id}`,
        title: e.label || e.id,
        url: e.concepturi || `https://www.wikidata.org/wiki/${e.id}`,
        domain: 'wikidata.org',
        snippet: text.slice(0, 300),
        text,
        tier: 3,
        confidence: 60,
        provider: 'wikidata',
        sourceLabel: 'Wikidata',
        tierLabel: 'Reference',
        contentFetched: Boolean(text),
      });
    });
  },
};

export function createDefaultSources(): SearchSource[] {
  return [
    SastramSource,
    ExaSource,
    TavilySource,
    HackerNewsSource,
    StackExchangeSource,
    GitHubSource,
    ArxivSource,
    WikipediaSource,
    WikidataSource,
  ];
}

export function normalizeSearchMode(mode: SearchMode | undefined): SearchMode {
  if (!mode) return 'pro';
  if (mode === 'standard' || mode === 'table') return 'pro';
  if (mode === 'advanced') return 'deep';
  if (mode === 'instant') return 'quick';
  if (mode === 'quick' || mode === 'pro' || mode === 'deep') return mode;
  return 'pro';
}

export function modeConfig(mode: SearchMode): { maxSources: number; synthesize: boolean; webKeysOptional: boolean } {
  const m = normalizeSearchMode(mode);
  if (m === 'quick') return { maxSources: 8, synthesize: true, webKeysOptional: true };
  if (m === 'deep') return { maxSources: 20, synthesize: true, webKeysOptional: false };
  return { maxSources: 14, synthesize: true, webKeysOptional: false };
}

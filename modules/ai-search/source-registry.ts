import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/infrastructure/logger';
import type { Source } from './types';
import type { SearchSource, SourceSearchContext, SourceRunResult } from './source-types';

function withTimeout<T>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  if (ms <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('source_timeout'));
    }, ms);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('aborted'));
    };
    if (signal) {
      if (signal.aborted) { clearTimeout(timer); reject(new Error('aborted')); return; }
      signal.addEventListener('abort', onAbort, { once: true });
    }
    promise.then(
      (v) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort); resolve(v); },
      (e) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort); reject(e); }
    );
  });
}

/** Canonical URL key for dedupe: scheme+host+path (lowercased), no trailing slash, no hash/utm. */
export function canonicalUrlKey(raw: string): string {
  try {
    const u = new URL(raw);
    const drop = new Set(['utm_source','utm_medium','utm_campaign','utm_term','utm_content','ref','fbclid','gclid']);
    for (const k of [...u.searchParams.keys()]) {
      if (drop.has(k.toLowerCase())) u.searchParams.delete(k);
    }
    u.hash = '';
    let path = u.pathname.replace(/\/+$/, '');
    if (!path) path = '/';
    return `${u.protocol}//${u.hostname.toLowerCase()}${path}${u.search ? `?${u.searchParams.toString()}` : ''}`;
  } catch {
    return raw.trim().toLowerCase().replace(/\/+$/, '');
  }
}

export function dedupeSourcesByCanonicalUrl(sources: Source[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const s of sources) {
    const key = canonicalUrlKey(s.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Reciprocal Rank Fusion over per-source ranked lists.
 * `lists` are ordered best-first within each source.
 */
export function reciprocalRankFusion(lists: Source[][], k = 60): Source[] {
  const scoreById = new Map<string, number>();
  const bestById = new Map<string, Source>();
  for (const list of lists) {
    // Dedup within a single source list to avoid self-inflation.
    const seenInList = new Set<string>();
    let rank = 0;
    for (const s of list) {
      const id = s.id || canonicalUrlKey(s.url) || uuidv4();
      if (seenInList.has(id)) continue;
      seenInList.add(id);
      rank += 1;
      scoreById.set(id, (scoreById.get(id) ?? 0) + 1 / (k + rank));
      if (!bestById.has(id)) bestById.set(id, s);
    }
  }
  const merged = [...bestById.values()].map((s) => ({
    s,
    score: scoreById.get(s.id) ?? scoreById.get(canonicalUrlKey(s.url)) ?? 0,
  }));
  merged.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.s.tier !== b.s.tier) return a.s.tier - b.s.tier;
    return b.s.confidence - a.s.confidence;
  });
  return merged.map((x) => x.s);
}

export async function runSources(
  sources: SearchSource[],
  ctx: SourceSearchContext
): Promise<{ merged: Source[]; runs: SourceRunResult[]; allLists: Source[][] }> {
  const enabled = sources.filter((s) => s.enabled(ctx));
  const runs = await Promise.allSettled(
    enabled.map(async (source): Promise<SourceRunResult & { list: Source[] }> => {
      const start = Date.now();
      const timeoutMs = source.timeoutMs ?? 8000;
      try {
        const list = await withTimeout(source.search(ctx), timeoutMs, ctx.signal);
        const durationMs = Date.now() - start;
        return {
          key: source.key,
          label: source.label,
          tierLabel: source.tierLabel,
          status: 'fulfilled',
          sources: Array.isArray(list) ? list : [],
          durationMs,
          list: Array.isArray(list) ? list : [],
        };
      } catch (err) {
        const durationMs = Date.now() - start;
        const msg = err instanceof Error ? err.message : String(err);
        const status = msg === 'source_timeout' ? 'timeout' : msg === 'aborted' ? 'skipped' : 'rejected';
        if (status === 'rejected') {
          logger.warn('[ai-search] source failed', { source: source.key, error: msg });
        }
        return { key: source.key, label: source.label, tierLabel: source.tierLabel, status, sources: [], error: msg, durationMs, list: [] };
      }
    })
  );

  const results: Array<SourceRunResult & { list: Source[] }> = runs.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { key: enabled[i].key, label: enabled[i].label, tierLabel: enabled[i].tierLabel, status: 'rejected', sources: [], error: String(r.reason), durationMs: 0, list: [] }
  );

  const allLists = results.map((r) => r.list);
  const fused = reciprocalRankFusion(allLists);
  const merged = dedupeSourcesByCanonicalUrl(fused);

  return {
    merged,
    runs: results.map(({ list: _list, ...rest }) => rest),
    allLists,
  };
}

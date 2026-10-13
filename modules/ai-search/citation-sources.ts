/**
 * Client-safe citation-source rendering (pure — no imports).
 * Single home for `[n] Title — url (...)` lines, shared by the collections
 * export route, collection metadata markdown, and (via re-export) citations.
 */

export interface CitableSource {
  id: string;
  title?: string | null;
  url?: string | null;
  domain?: string | null;
  tier?: number | null;
  confidence?: number | null;
  provider?: string | null;
  isOutdated?: boolean;
  contentFetched?: boolean;
}

export interface SourceCitation {
  marker: number;
  sourceId: string;
}

/**
 * Shared citation-source markdown lines. Markers follow citation order;
 * orphans (no matching source) are dropped.
 */
export function renderCitationSources(
  citations: SourceCitation[],
  sources: CitableSource[]
): string[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const sorted = [...citations].sort((a, b) => a.marker - b.marker);
  const lines: string[] = [];
  for (const c of sorted) {
    const s = byId.get(c.sourceId);
    if (!s) continue;
    lines.push(
      `[${c.marker}] ${s.title || s.domain} — ${s.url} (${s.domain} · T${s.tier} · ${s.provider} · ${Math.round(s.confidence ?? 0)}%${s.isOutdated ? ' · outdated' : ''}${s.contentFetched === false ? ' · snippet only' : ''})`
    );
  }
  return lines;
}

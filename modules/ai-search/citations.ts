import type { Citation, Source } from './types';

/**
 * Models emit `[n]` markers unreliably — we validate and renumber to [1..N] in
 * first-seen order, drop orphans, collapse dupes, and only cite fetched content.
 */

export interface CitationValidationResult {
  /** Rewritten prose with normalized [n] markers. */
  text: string;
  /** Normalized, renumbered, deduped citation list. */
  citations: Citation[];
  /** Number of distinct sources cited more than the reuse cap (0 = fine). */
  overCitedSources: number;
}

const MARKER_RE = /\[(\d+)\]/g;
export const CITATION_REUSE_CAP = 8;

export function validateCitations(
  rawText: string,
  rawCitations: Citation[],
  sources: Source[],
  reuseCap: number = CITATION_REUSE_CAP
): CitationValidationResult {
  const text = rawText ?? '';

  // Build a lookup of sourceId -> whether its content was actually fetched.
  const fetched = new Set(sources.filter((s) => s.contentFetched !== false).map((s) => s.id));

  // Collect every marker that actually appears in the text, in order.
  const presentMarkers: number[] = [];
  let m: RegExpExecArray | null;
  MARKER_RE.lastIndex = 0;
  while ((m = MARKER_RE.exec(text))) {
    presentMarkers.push(Number(m[1]));
  }

  // Map: original marker -> sourceId (only valid, fetched, in-range citations).
  const citationByMarker = new Map<number, string>();
  for (const c of rawCitations) {
    if (typeof c?.marker !== 'number' || typeof c?.sourceId !== 'string') continue;
    if (!fetched.has(c.sourceId)) continue; // never cite un-fetched content
    if (!citationByMarker.has(c.marker)) citationByMarker.set(c.marker, c.sourceId);
  }

  // For each marker present in the text, find its sourceId (orphan if missing).
  // Assign a stable new marker per (first-seen-in-text, sourceId) pair.
  const newMarkerBySource = new Map<string, number>();
  const orderedSourceIds: string[] = [];
  const markerAtPosition: number[] = []; // new marker index aligned to presentMarkers
  // Count every citation occurrence per source (for the reuse cap).
  const citeCountBySource = new Map<string, number>();

  for (const origMarker of presentMarkers) {
    const sourceId = citationByMarker.get(origMarker);
    if (!sourceId) {
      // Orphan marker in text with no matching citation — drop it.
      markerAtPosition.push(-1);
      continue;
    }
    // Every resolved marker counts toward the source's citation total.
    citeCountBySource.set(sourceId, (citeCountBySource.get(sourceId) ?? 0) + 1);
    let newMarker = newMarkerBySource.get(sourceId);
    if (newMarker === undefined) {
      newMarker = orderedSourceIds.length + 1;
      newMarkerBySource.set(sourceId, newMarker);
      orderedSourceIds.push(sourceId);
    }
    markerAtPosition.push(newMarker);
  }

  // Rewrite the prose: replace each [origMarker] with its new marker (or strip if orphan).
  let out = '';
  let last = 0;
  MARKER_RE.lastIndex = 0;
  let posIdx = 0;
  while ((m = MARKER_RE.exec(text))) {
    const origMarker = Number(m[1]);
    const newMarker = citationByMarker.has(origMarker)
      ? markerAtPosition[presentMarkers.indexOf(origMarker)]
      : -1;
    out += text.slice(last, m.index);
    if (newMarker > 0) out += `[${newMarker}]`;
    // else: orphan marker stripped from prose
    last = m.index + m[0].length;
    posIdx++;
  }
  out += text.slice(last);

  // Build normalized citations (orphan citations with no marker in text are dropped).
  const usedNewMarkers = new Set(markerAtPosition.filter((x) => x > 0));
  const citations: Citation[] = orderedSourceIds
    .map((sourceId, i) => ({ marker: i + 1, sourceId }))
    .filter((c) => usedNewMarkers.has(c.marker));

  // Reuse cap check (informational): count how many times each source is cited
  // across the whole text (every marker occurrence, not just distinct markers).
  let overCitedSources = 0;
  for (const c of citeCountBySource.values()) if (c > reuseCap) overCitedSources++;

  return { text: out, citations, overCitedSources };
}

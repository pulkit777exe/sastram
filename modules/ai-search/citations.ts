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

/** Collect every [n] marker in the text in order of appearance. Uses matchAll to avoid stateful lastIndex. */
function collectMarkers(text: string): number[] {
  const markers: number[] = [];
  for (const match of text.matchAll(MARKER_RE)) {
    markers.push(Number(match[1]));
  }
  return markers;
}

/** Build a lookup of sourceId -> whether its content was actually fetched. Explicit loop for readability. */
function buildFetchedSet(sources: Source[]): Set<string> {
  const fetched = new Set<string>();
  for (const source of sources) {
    if (source.contentFetched !== false) {
      fetched.add(source.id);
    }
  }
  return fetched;
}

/** Build map from original marker number to sourceId, only for valid and fetched citations. */
function buildCitationByMarker(
  rawCitations: Citation[],
  fetched: Set<string>
): Map<number, string> {
  const citationByMarker = new Map<number, string>();
  for (const citation of rawCitations) {
    if (typeof citation?.marker !== 'number' || typeof citation?.sourceId !== 'string') {
      continue;
    }
    if (!fetched.has(citation.sourceId)) {
      continue;
    }
    if (!citationByMarker.has(citation.marker)) {
      citationByMarker.set(citation.marker, citation.sourceId);
    }
  }
  return citationByMarker;
}

interface Renumbering {
  orderedSourceIds: string[];
  newMarkerBySource: Map<string, number>;
  newMarkerByOrigMarker: Map<number, number>;
  markerAtPosition: number[];
  citeCountBySource: Map<string, number>;
}

/** Assign stable new markers [1..N] per first-seen sourceId. Uses Maps for O(1) lookups instead of indexOf. */
function assignRenumbering(
  presentMarkers: number[],
  citationByMarker: Map<number, string>
): Renumbering {
  const newMarkerBySource = new Map<string, number>();
  const orderedSourceIds: string[] = [];
  const markerAtPosition: number[] = [];
  const citeCountBySource = new Map<string, number>();
  const newMarkerByOrigMarker = new Map<number, number>();

  for (const origMarker of presentMarkers) {
    const sourceId = citationByMarker.get(origMarker);
    if (!sourceId) {
      // Orphan marker in text with no matching citation — drop it.
      markerAtPosition.push(-1);
      continue;
    }

    // Every resolved marker counts toward the source's citation total.
    const currentCount = citeCountBySource.get(sourceId) ?? 0;
    citeCountBySource.set(sourceId, currentCount + 1);

    let newMarker = newMarkerBySource.get(sourceId);
    if (newMarker === undefined) {
      newMarker = orderedSourceIds.length + 1;
      newMarkerBySource.set(sourceId, newMarker);
      orderedSourceIds.push(sourceId);
    }

    // Cache origMarker -> newMarker for O(1) rewrite lookup.
    if (!newMarkerByOrigMarker.has(origMarker)) {
      newMarkerByOrigMarker.set(origMarker, newMarker);
    }

    markerAtPosition.push(newMarker);
  }

  return {
    orderedSourceIds,
    newMarkerBySource,
    newMarkerByOrigMarker,
    markerAtPosition,
    citeCountBySource,
  };
}

/** Rewrite prose: replace each [origMarker] with its new marker or strip if orphan. Uses matchAll. */
function rewriteText(
  text: string,
  citationByMarker: Map<number, string>,
  newMarkerByOrigMarker: Map<number, number>
): string {
  let out = '';
  let lastIndex = 0;

  for (const match of text.matchAll(MARKER_RE)) {
    const fullMatch = match[0];
    const matchIndex = match.index ?? 0;
    const origMarker = Number(match[1]);

    out += text.slice(lastIndex, matchIndex);

    // Use Map lookup instead of indexOf for O(1) and correct handling of duplicates.
    let newMarker = -1;
    if (citationByMarker.has(origMarker)) {
      newMarker = newMarkerByOrigMarker.get(origMarker) ?? -1;
    }

    if (newMarker > 0) {
      out += `[${newMarker}]`;
    }
    // else: orphan marker stripped from prose

    lastIndex = matchIndex + fullMatch.length;
  }

  out += text.slice(lastIndex);
  return out;
}

export function validateCitations(
  rawText: string,
  rawCitations: Citation[],
  sources: Source[],
  reuseCap: number = CITATION_REUSE_CAP
): CitationValidationResult {
  const text = rawText ?? '';

  const fetched = buildFetchedSet(sources);
  const presentMarkers = collectMarkers(text);
  const citationByMarker = buildCitationByMarker(rawCitations, fetched);
  const { orderedSourceIds, markerAtPosition, citeCountBySource, newMarkerByOrigMarker } =
    assignRenumbering(presentMarkers, citationByMarker);

  const out = rewriteText(text, citationByMarker, newMarkerByOrigMarker);

  // Build normalized citations (orphan citations with no marker in text are dropped).
  const usedNewMarkers = new Set<number>();
  for (const marker of markerAtPosition) {
    if (marker > 0) {
      usedNewMarkers.add(marker);
    }
  }

  const citations: Citation[] = [];
  for (let i = 0; i < orderedSourceIds.length; i++) {
    const marker = i + 1;
    if (usedNewMarkers.has(marker)) {
      citations.push({ marker, sourceId: orderedSourceIds[i] });
    }
  }

  // Reuse cap check (informational): count how many times each source is cited
  // across the whole text (every marker occurrence, not just distinct markers).
  let overCitedSources = 0;
  for (const count of citeCountBySource.values()) {
    if (count > reuseCap) {
      overCitedSources++;
    }
  }

  return { text: out, citations, overCitedSources };
}

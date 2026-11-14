import type { ClaimStatus, Prisma } from '@prisma/client';
import type { ResearchEvidence, Source } from '@/modules/ai-search/types';
import { computeClaimStatus } from './status';
import type { ClaimSummary, PublicClaimSummary } from './types';

const MAX_CLAIM_TEXT = 500;
const MAX_LABEL = 120;
const MAX_EXCERPT = 280;

function truncate(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function tryParseHostname(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isInternalSastramSource(source: Source | undefined): boolean {
  if (!source) return false;
  if (source.provider === 'sastram') return true;
  const host = tryParseHostname(source.url);
  if (!host) return false;
  return (
    host === 'sastram.app' ||
    host.endsWith('.sastram.app') ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0'
  );
}

export interface ClaimCreateInput {
  position: number;
  text: string;
  status: ClaimStatus;
  sourceId: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  excerpt: string | null;
  confidence: number | null;
}

export function buildClaimRowsFromEvidence(
  evidence: ResearchEvidence[] | null | undefined,
  sources: Source[] | null | undefined
): ClaimCreateInput[] {
  if (!evidence || evidence.length === 0) return [];
  const sourceById = new Map<string, Source>();
  for (const s of sources ?? []) {
    if (s?.id) sourceById.set(s.id, s);
  }

  const rows: ClaimCreateInput[] = [];
  for (let i = 0; i < evidence.length; i++) {
    const ev = evidence[i];
    const text = truncate(ev?.claim, MAX_CLAIM_TEXT);
    if (!text) continue;
    const source = ev?.sourceId ? sourceById.get(ev.sourceId) : undefined;
    const internal = isInternalSastramSource(source);

    let sourceId: string | null = ev?.sourceId ?? null;
    let sourceLabel: string | null = null;
    let sourceUrl: string | null = null;
    let excerpt: string | null = null;

    if (internal) {
      sourceId = ev?.sourceId ?? null;
      sourceLabel = 'Sastram discussion';
      sourceUrl = null;
      excerpt = null;
    } else if (source) {
      sourceLabel = truncate(source.sourceLabel ?? source.domain ?? source.title, MAX_LABEL);
      sourceUrl = truncate(source.url, 500);
      excerpt = truncate(ev?.excerpt ?? source.snippet, MAX_EXCERPT);
    } else {
      sourceLabel = null;
      sourceUrl = null;
      excerpt = truncate(ev?.excerpt, MAX_EXCERPT);
    }

    const confidenceRaw = ev?.confidence ?? source?.confidence;
    const confidence =
      typeof confidenceRaw === 'number' && Number.isFinite(confidenceRaw)
        ? Math.max(0, Math.min(100, Math.round(confidenceRaw)))
        : null;

    rows.push({
      position: i,
      text,
      status: computeClaimStatus(0, 0),
      sourceId,
      sourceLabel,
      sourceUrl,
      excerpt,
      confidence,
    });
  }
  return rows;
}

export function toClaimSummary(row: {
  id: string;
  messageId: string;
  position: number;
  text: string;
  status: ClaimStatus;
  sourceLabel: string | null;
  sourceUrl: string | null;
  excerpt: string | null;
  confidence: number | null;
  confirmCount: number;
  disputeCount: number;
}): ClaimSummary {
  return {
    id: row.id,
    messageId: row.messageId,
    position: row.position,
    text: row.text,
    status: row.status,
    sourceLabel: row.sourceLabel,
    sourceUrl: row.sourceUrl,
    excerpt: row.excerpt,
    confidence: row.confidence,
    confirmCount: row.confirmCount,
    disputeCount: row.disputeCount,
    net: row.confirmCount - row.disputeCount,
  };
}

export function toPublicClaimSummary(row: {
  id: string;
  messageId: string;
  position: number;
  text: string;
  status: ClaimStatus;
  sourceLabel: string | null;
  sourceUrl: string | null;
  excerpt: string | null;
  confidence: number | null;
  confirmCount: number;
  disputeCount: number;
}): PublicClaimSummary {
  return toClaimSummary(row);
}

export const claimSelect = {
  id: true,
  messageId: true,
  position: true,
  text: true,
  status: true,
  sourceLabel: true,
  sourceUrl: true,
  excerpt: true,
  confidence: true,
  confirmCount: true,
  disputeCount: true,
} as const satisfies Prisma.ClaimSelect;

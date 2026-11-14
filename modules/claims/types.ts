import type { ClaimStatus } from '@prisma/client';

export interface ClaimSummary {
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
  net: number;
}

export interface PublicClaimSummary {
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
  net: number;
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

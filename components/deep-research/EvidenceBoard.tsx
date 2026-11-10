'use client';

import { ExternalLink, FileText, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import type { Source } from '@/modules/ai-search/types';
import type { ResearchEvidence } from '@/modules/ai-search/types';

export interface EvidenceBoardItem {
  id: string;
  source?: Source;
  evidence?: ResearchEvidence;
  title?: string;
  url?: string;
  domain?: string;
  excerpt?: string;
  claim?: string;
  confidence?: number;
  tier?: 1 | 2 | 3 | 4;
}

interface EvidenceBoardProps {
  items?: EvidenceBoardItem[];
  sources?: Source[];
  evidence?: ResearchEvidence[];
  maxItems?: number;
  className?: string;
}

function getConfidenceColor(confidence?: number) {
  if (confidence === undefined || confidence === null) return 'text-ink-3';
  if (confidence >= 0.8) return 'text-emerald-500';
  if (confidence >= 0.6) return 'text-amber-500';
  return 'text-red-500';
}

function getTierBadge(tier?: 1 | 2 | 3 | 4) {
  if (!tier) return null;
  const labels = { 1: 'Primary', 2: 'Secondary', 3: 'Tertiary', 4: 'Other' };
  return labels[tier];
}

export function EvidenceBoard({
  items,
  sources,
  evidence,
  maxItems,
  className,
}: EvidenceBoardProps) {
  // Normalize inputs
  const normalizedItems: EvidenceBoardItem[] = items || [];

  if (sources && sources.length > 0) {
    for (const source of sources) {
      if (!normalizedItems.find((i) => i.source?.id === source.id)) {
        normalizedItems.push({
          id: source.id,
          source,
          title: source.title,
          url: source.url,
          domain: source.domain,
          excerpt: source.snippet || source.text,
          confidence: source.confidence,
          tier: source.tier,
        });
      }
    }
  }

  if (evidence && evidence.length > 0) {
    for (const ev of evidence) {
      if (!normalizedItems.find((i) => i.evidence?.id === ev.id)) {
        const relatedSource = sources?.find((s) => s.id === ev.sourceId);
        normalizedItems.push({
          id: ev.id,
          evidence: ev,
          source: relatedSource,
          title: relatedSource?.title || ev.claim,
          url: relatedSource?.url,
          domain: relatedSource?.domain,
          excerpt: ev.excerpt,
          claim: ev.claim,
          confidence: ev.confidence ?? relatedSource?.confidence,
        });
      }
    }
  }

  const displayedItems = maxItems ? normalizedItems.slice(0, maxItems) : normalizedItems;

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-brand" />
          Evidence
          {displayedItems.length > 0 ? (
            <Badge variant="secondary" className="ml-auto text-xs">
              {displayedItems.length}
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {displayedItems.length === 0 ? (
          <p className="text-sm text-ink-3 text-center py-4">No evidence collected yet</p>
        ) : (
          displayedItems.map((item) => {
            const confidence = item.confidence;
            const hasHighConfidence = confidence !== undefined && confidence >= 0.8;

            return (
              <div
                key={item.id}
                className="rounded-card border border-line/60 p-3 hover:bg-hover/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      {item.domain ? (
                        <span className="text-xs text-ink-3 truncate">{item.domain}</span>
                      ) : null}
                      {item.tier ? (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                          {getTierBadge(item.tier)}
                        </Badge>
                      ) : null}
                    </div>
                    {item.title ? (
                      <p className="text-sm font-medium text-ink line-clamp-2">{item.title}</p>
                    ) : null}
                  </div>
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-ink-3 hover:text-brand transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>
                {item.claim ? (
                  <p className="text-xs text-ink-2 mb-1.5 line-clamp-2">{item.claim}</p>
                ) : null}
                {item.excerpt ? (
                  <p className="text-xs text-ink-3 line-clamp-3">{item.excerpt}</p>
                ) : null}
                <div className="flex items-center gap-2 mt-2">
                  {confidence !== undefined && confidence !== null ? (
                    <div className="flex items-center gap-1 text-xs">
                      {hasHighConfidence ? (
                        <ShieldCheck className={cn('h-3 w-3', getConfidenceColor(confidence))} />
                      ) : (
                        <AlertTriangle className={cn('h-3 w-3', getConfidenceColor(confidence))} />
                      )}
                      <span className={cn('font-mono', getConfidenceColor(confidence))}>
                        {(confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

'use client';

import { useRef } from 'react';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ConflictInfo, Citation } from '@/modules/ai-search/types';
import type { Source } from '@/modules/ai-search/types';

interface SynthesisCardProps {
  text: string;
  citations?: Citation[];
  sources?: Source[];
  conflictData?: ConflictInfo | null;
  sourceCount: number;
  queryType: 'factual' | 'opinion' | 'technical' | 'comparison';
  onCiteClick?: (sourceId: string) => void;
  isStreaming?: boolean;
}

const QUERY_TYPE_LABELS: Record<string, { label: string; variant: 'live' | 'warning' | 'success' | 'secondary' }> = {
  factual: {
    label: 'Factual',
    variant: 'live',
  },
  opinion: {
    label: 'Opinion',
    variant: 'warning',
  },
  technical: {
    label: 'Technical',
    variant: 'success',
  },
  comparison: {
    label: 'Comparison',
    variant: 'secondary',
  },
};

interface Segment {
  type: 'text' | 'cite';
  value: string;
  marker?: number;
  sourceId?: string;
}

/** Parse prose with inline [n] markers into text + citation segments. */
function parseSegments(text: string, citations: Citation[]): Segment[] {
  const byMarker = new Map(citations.map((c) => [c.marker, c]));
  const segments: Segment[] = [];
  const regex = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const marker = Number(match[1]);
    const citation = byMarker.get(marker);
    if (citation) {
      if (match.index > lastIndex) {
        segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
      }
      segments.push({
        type: 'cite',
        value: `[${marker}]`,
        marker,
        sourceId: citation.sourceId,
      });
      lastIndex = regex.lastIndex;
    }
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}

export function SynthesisCard({
  text,
  citations = [],
  sources = [],
  conflictData,
  sourceCount,
  queryType,
  onCiteClick,
  isStreaming = false,
}: SynthesisCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const typeConfig = QUERY_TYPE_LABELS[queryType] || QUERY_TYPE_LABELS.technical;
  const segments = parseSegments(text, citations);

  const handleCiteClick = (sourceId?: string) => {
    if (sourceId && onCiteClick) onCiteClick(sourceId);
  };

  if (!text) {
    return (
      <div className="bg-card border border-border rounded-2xl p-5 text-center text-sm text-muted-foreground">
        No synthesis available.
      </div>
    );
  }

  const tierOf = (sourceId?: string) =>
    sources.find((s) => s.id === sourceId)?.tier;

  return (
    <div
      className="relative bg-card border border-border rounded-2xl shadow-linear-md overflow-hidden"
    >
      {/* Top shimmer line */}
      <div className="h-0.5 w-full bg-linear-to-r from-transparent via-foreground/20 to-transparent">
        {isStreaming && (
          <div className="h-full w-1/3 bg-linear-to-r from-transparent via-foreground/50 to-transparent animate-[shimmer_1.5s_ease-in-out_infinite]" />
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-brand" />
          <span className="text-sm font-semibold text-foreground">Sai Synthesis</span>
          <span className="text-xs text-muted-foreground">
            · {sourceCount} source{sourceCount !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={typeConfig.variant} className="px-2 py-0.5 text-xs font-medium">
            {typeConfig.label}
          </Badge>
        </div>
      </div>

      {/* Content with inline citations */}
      <div ref={containerRef} className="px-5 pb-4 max-h-130 overflow-y-auto">
        <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
          {segments.map((seg, i) =>
            seg.type === 'cite' ? (
              <button
                key={i}
                type="button"
                onClick={() => handleCiteClick(seg.sourceId)}
                title={
                  seg.sourceId
                    ? `Source: ${sources.find((s) => s.id === seg.sourceId)?.domain ?? ''}`
                    : undefined
                }
                className={`inline-flex items-center justify-center mx-0.5 w-4 h-4 align-text-bottom rounded-full text-xs font-semibold leading-none transition-colors ${
                  seg.sourceId
                    ? 'bg-foreground/10 text-foreground hover:bg-foreground hover:text-background'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {seg.marker}
              </button>
            ) : (
              <span key={i}>{seg.value}</span>
            )
          )}
          {isStreaming && (
            <span className="inline-block w-0.5 h-4 bg-foreground/50 animate-pulse ml-0.5 align-text-bottom" />
          )}
        </div>
      </div>

      {/* Conflict warning — only when conflictData is non-null and detected */}
      {conflictData?.detected && (
        <div className="mx-5 mb-4 px-4 py-3 bg-chart-4/10 border border-chart-4/20 rounded-xl">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-chart-4 mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-chart-4 mb-1">
                Conflict Detected
              </p>
              <p className="text-muted-foreground mb-1">{conflictData.description}</p>
              {conflictData.sideA && (
                <p className="text-foreground/70">
                  <strong>Side A:</strong> {conflictData.sideA}
                </p>
              )}
              {conflictData.sideB && (
                <p className="text-foreground/70">
                  <strong>Side B:</strong> {conflictData.sideB}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { Sparkles, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ConflictInfo, Citation, Source } from '@/modules/ai-search/types';
import { StreamingText, type RetryStyle, type FeedbackType } from './StreamingText';

interface SynthesisCardProps {
  text: string;
  citations?: Citation[];
  sources?: Source[];
  conflictData?: ConflictInfo | null;
  sourceCount: number;
  queryType: 'factual' | 'opinion' | 'technical' | 'comparison';
  onCiteClick?: (sourceId: string) => void;
  isStreaming?: boolean;
  fromHistory?: boolean;
  onRetry?: (style: RetryStyle) => void;
  onFeedback?: (type: FeedbackType, reason?: string) => void;
}

const QUERY_TYPE_LABELS: Record<string, { label: string; variant: 'live' | 'warning' | 'success' | 'secondary' }> = {
  factual: { label: 'Factual', variant: 'live' },
  opinion: { label: 'Opinion', variant: 'warning' },
  technical: { label: 'Technical', variant: 'success' },
  comparison: { label: 'Comparison', variant: 'secondary' },
};

export function SynthesisCard({
  text,
  citations = [],
  sources = [],
  conflictData,
  sourceCount,
  queryType,
  onCiteClick,
  isStreaming = false,
  fromHistory = false,
  onRetry,
  onFeedback,
}: SynthesisCardProps) {
  const typeConfig = QUERY_TYPE_LABELS[queryType] || QUERY_TYPE_LABELS.technical;

  if (!text) {
    return (
      <div className="bg-surface border border-line rounded-card p-5 text-center text-sm text-ink-2 shadow-card">
        No synthesis available.
      </div>
    );
  }

  return (
    <div className="relative bg-surface border border-line rounded-card shadow-card overflow-hidden">
      {/* Top shimmering loader line when streaming */}
      <div className="h-0.5 w-full bg-linear-to-r from-transparent via-line-strong to-transparent">
        {isStreaming && (
          <div
            className="h-full w-1/3 bg-linear-to-r from-transparent via-ink-2 to-transparent"
            style={{
              backgroundSize: '200% 100%',
              animation: 'shimmer-text 1.4s linear infinite',
            }}
          />
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-ink" />
          <span className="text-[13px] font-semibold text-ink">Sai Synthesis</span>
          <span className="text-[12px] text-ink-3">
            · {sourceCount} source{sourceCount !== 1 ? 's' : ''}
          </span>
        </div>

        <div>
          <Badge variant={typeConfig.variant} className="px-2 py-0.5 text-[11px] font-medium rounded-full">
            {typeConfig.label}
          </Badge>
        </div>
      </div>

      {/* Content wrapper */}
      <div className="px-5 pb-5">
        <StreamingText
          text={text}
          sources={sources}
          isStreaming={isStreaming}
          fromHistory={fromHistory}
          onDone={() => {}}
          onRetry={onRetry}
          onFeedback={onFeedback}
        />
      </div>

      {/* Conflict Warning */}
      {conflictData?.detected && (
        <div className="mx-5 mb-5 px-4 py-3 bg-red-tint border border-line rounded-card animate-fade-up">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={15} className="text-red mt-0.5 shrink-0" />
            <div className="text-[12.5px] leading-relaxed">
              <p className="font-semibold text-red mb-0.5">Conflict Detected</p>
              <p className="text-ink-2 mb-1.5">{conflictData.description}</p>
              {conflictData.sideA && (
                <p className="text-ink font-medium">
                  <span className="text-ink-3 font-normal">Side A:</span> {conflictData.sideA}
                </p>
              )}
              {conflictData.sideB && (
                <p className="text-ink font-medium">
                  <span className="text-ink-3 font-normal">Side B:</span> {conflictData.sideB}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

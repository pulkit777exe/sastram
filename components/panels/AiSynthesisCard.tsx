'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { isAiNotConfigured } from '@/lib/services/ai-sentinel';
import { AiNotConfiguredNotice } from '@/components/ui/ai-not-configured';

interface AiSource {
  source: string;
  url: string | null;
  confidence: number;
  snippet: string | null;
}

interface AiSynthesisCardProps {
  summary: string | null;
  sources: AiSource[];
  lastUpdated: Date | null;
  threadId: string;
  messageCount: number;
}

export default function AiSynthesisCard({
  summary,
  sources,
  lastUpdated,
  threadId,
  messageCount,
}: AiSynthesisCardProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const hasSummary = summary !== null && summary.length > 0 && !isAiNotConfigured(summary);
  const isGenerating = !hasSummary && messageCount >= 5;

  const handleTransfer = () => {
    const params = new URLSearchParams({ context: threadId });
    router.push(`/dashboard/sai-search?${params.toString()}`);
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute h-full w-full animate-[pulse-dot_2s_ease_infinite] rounded-full bg-brand" />
            <span className="relative h-2 w-2 rounded-full bg-brand" />
          </span>
          <p className="font-(--font-dm-mono) text-xs uppercase tracking-[0.12em] text-muted-foreground">
            Sai synthesis
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {hasSummary && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-background transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={handleTransfer}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand/10"
          >
            Transfer
          </button>
        </div>
      </div>

      <div className="space-y-2.5 text-sm text-muted-foreground">
        {summary !== null && isAiNotConfigured(summary) ? (
          <AiNotConfiguredNotice />
        ) : isGenerating ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
            <p className="text-sm text-muted-foreground">Summary generating...</p>
          </div>
        ) : hasSummary ? (
          <>
            <p className="text-sm text-foreground">
              {isExpanded ? summary : summary.length > 150 ? `${summary.slice(0, 150)}…` : summary}
            </p>
            {!isExpanded && summary.length > 150 && (
              <button
                type="button"
                onClick={() => setIsExpanded(true)}
                className="text-xs font-medium text-brand hover:underline"
              >
                Read more
              </button>
            )}
            {lastUpdated && (
              <p className="text-xs text-muted-foreground">
                Updated {new Date(lastUpdated).toLocaleDateString()}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-foreground">
            Sai will synthesize this thread once enough messages are available.
          </p>
        )}

        <div className="t-panel-slide" data-open={isExpanded ? 'true' : 'false'}>
          {sources.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {sources.map((source) => {
              const confidence =
                source.confidence < 0 ? 0 : source.confidence > 100 ? 100 : source.confidence;

              const confidenceClass =
                confidence >= 90
                  ? 'text-chart-2'
                  : confidence >= 70
                    ? 'text-chart-4'
                    : 'text-muted-foreground';

              return (
                <div
                  key={`${source.source}-${source.url ?? ''}`}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-5 w-5 items-center justify-center rounded-md bg-background">
                      <span className="text-xs font-semibold text-foreground">
                        {source.source.slice(0, 1).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-foreground">{source.source}</span>
                      {source.snippet && (
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {source.snippet}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs font-medium ${confidenceClass}`}>
                    {confidence}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>
    </section>
  );
}

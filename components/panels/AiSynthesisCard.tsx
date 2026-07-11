'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { isAiNotConfigured } from '@/lib/services/ai';
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
    router.push(`/ai-search?${params.toString()}`);
  };

  return (
    <section className="rounded-[10px] border border-border bg-(--surface) p-[16px]">
      <div className="mb-[12px] flex items-center justify-between">
        <div className="flex items-center gap-[8px]">
          <span className="relative flex h-[8px] w-[8px]">
            <span className="absolute h-full w-full animate-[pulse-dot_2s_ease_infinite] rounded-full bg-(--blue)" />
            <span className="relative h-[8px] w-[8px] rounded-full bg-(--blue)" />
          </span>
          <p className="font-(--font-dm-mono) text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            AI synthesis
          </p>
        </div>

        <div className="flex items-center gap-[6px]">
          {hasSummary && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="rounded-[6px] border border-border px-[8px] py-[4px] text-[11px] font-medium text-muted-foreground hover:bg-(--bg) transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="h-[12px] w-[12px]" />
              ) : (
                <ChevronRight className="h-[12px] w-[12px]" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={handleTransfer}
            className="rounded-[6px] border border-border px-[10px] py-[4px] text-[11px] font-medium text-(--blue) hover:bg-(--blue-dim)"
          >
            Transfer
          </button>
        </div>
      </div>

      <div className="space-y-[10px] text-[13px] text-muted-foreground">
        {summary !== null && isAiNotConfigured(summary) ? (
          <AiNotConfiguredNotice />
        ) : isGenerating ? (
          <div className="flex items-center gap-[8px]">
            <Loader2 className="h-[14px] w-[14px] animate-spin text-(--blue)" />
            <p className="text-[13px] text-muted-foreground">Summary generating...</p>
          </div>
        ) : hasSummary ? (
          <>
            <p className="text-[13px] text-(--text)">
              {isExpanded ? summary : summary.length > 150 ? `${summary.slice(0, 150)}…` : summary}
            </p>
            {!isExpanded && summary.length > 150 && (
              <button
                type="button"
                onClick={() => setIsExpanded(true)}
                className="text-[11px] font-medium text-(--blue) hover:underline"
              >
                Read more
              </button>
            )}
            {lastUpdated && (
              <p className="text-[11px] text-muted-foreground">
                Updated {new Date(lastUpdated).toLocaleDateString()}
              </p>
            )}
          </>
        ) : (
          <p className="text-[13px] text-(--text)">
            AI will synthesize this thread once enough messages are available.
          </p>
        )}

        <div className="t-panel-slide" data-open={isExpanded ? 'true' : 'false'}>
          {sources.length > 0 && (
          <div className="mt-[8px] space-y-[6px]">
            {sources.map((source) => {
              const confidence =
                source.confidence < 0 ? 0 : source.confidence > 100 ? 100 : source.confidence;

              const confidenceClass =
                confidence >= 90
                  ? 'text-(--green)'
                  : confidence >= 70
                    ? 'text-(--amber)'
                    : 'text-muted-foreground';

              return (
                <div
                  key={`${source.source}-${source.url ?? ''}`}
                  className="flex items-center justify-between gap-[8px]"
                >
                  <div className="flex items-center gap-[8px]">
                    <div className="flex h-[20px] w-[20px] items-center justify-center rounded-[6px] bg-(--bg)">
                      <span className="text-[11px] font-semibold text-(--text)">
                        {source.source.slice(0, 1).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[12px] text-(--text)">{source.source}</span>
                      {source.snippet && (
                        <span className="text-[11px] text-muted-foreground line-clamp-1">
                          {source.snippet}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`text-[11px] font-medium ${confidenceClass}`}>
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

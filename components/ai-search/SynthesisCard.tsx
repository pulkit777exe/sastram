"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Sparkles, Clock } from "lucide-react";
import type { ConflictInfo } from "@/modules/ai-search/types";

interface SynthesisCardProps {
  content: string;
  conflictData?: ConflictInfo;
  confidence: number;
  sourceCount: number;
  queryType: "factual" | "opinion" | "technical" | "comparison";
}

const QUERY_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  factual: {
    label: "Factual",
    color: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  opinion: {
    label: "Opinion",
    color: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  },
  technical: {
    label: "Technical",
    color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  comparison: {
    label: "Comparison",
    color: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
};

export function SynthesisCard({
  content,
  conflictData,
  confidence,
  sourceCount,
  queryType,
}: SynthesisCardProps) {
  const [displayedContent, setDisplayedContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const charIndex = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!content) {
      setDisplayedContent("");
      setIsStreaming(false);
      return;
    }

    // Reset for new content
    charIndex.current = 0;
    setDisplayedContent("");
    setIsStreaming(true);

    intervalRef.current = setInterval(() => {
      if (charIndex.current >= content.length) {
        setIsStreaming(false);
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }
      // Batch 3 chars for smoother streaming
      const batch = content.substring(charIndex.current, charIndex.current + 3);
      charIndex.current += 3;
      setDisplayedContent((prev) => prev + batch);

      // Auto-scroll
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    }, 12);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [content]);

  const typeConfig =
    QUERY_TYPE_LABELS[queryType] || QUERY_TYPE_LABELS.technical;

  // Handle empty content
  if (!content) {
    return (
      <div className="bg-card border border-border rounded-2xl p-5 text-center text-sm text-muted-foreground">
        No synthesis available. The AI may have encountered an issue.
      </div>
    );
  }

  return (
    <div className="relative bg-card border border-border rounded-2xl overflow-hidden">
      {/* Top shimmer line */}
      <div className="h-0.5 w-full bg-linear-to-r from-transparent via-foreground/20 to-transparent">
        {isStreaming && (
          <div className="h-full w-1/3 bg-linear-to-r from-transparent via-foreground/50 to-transparent animate-[shimmer_1.5s_ease-in-out_infinite]" />
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-indigo-400" />
          <span className="text-sm font-semibold text-foreground">
            AI Synthesis
          </span>
          <span className="text-xs text-muted-foreground">
            · {sourceCount} source{sourceCount !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Query type badge */}
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${typeConfig.color}`}
          >
            {typeConfig.label}
          </span>

          {/* Confidence */}
          <div className="flex items-center gap-1.5">
            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${confidence}%`,
                  backgroundColor:
                    confidence > 70
                      ? "var(--color-foreground)"
                      : confidence > 40
                        ? "hsl(35, 90%, 55%)"
                        : "hsl(0, 70%, 55%)",
                }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground font-medium tabular-nums">
              {confidence}%
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div
        ref={containerRef}
        className="px-5 pb-4 max-h-[400px] overflow-y-auto"
      >
        <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
          {displayedContent}
          {isStreaming && (
            <span className="inline-block w-0.5 h-4 bg-foreground/50 animate-pulse ml-0.5 align-text-bottom" />
          )}
        </div>
      </div>

      {/* Conflict warning */}
      {conflictData?.detected && !isStreaming && (
        <div className="mx-5 mb-4 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <div className="flex items-start gap-2">
            <AlertTriangle
              size={14}
              className="text-amber-500 mt-0.5 shrink-0"
            />
            <div className="text-xs">
              <p className="font-medium text-amber-600 dark:text-amber-400 mb-1">
                Conflict Detected
              </p>
              <p className="text-muted-foreground mb-1">
                {conflictData.description}
              </p>
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

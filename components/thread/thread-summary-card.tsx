'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, RefreshCw } from 'lucide-react';
import { toasts } from '@/lib/utils/toast';
import { cn } from '@/lib/utils/cn';
import { isAiNotConfigured } from '@/lib/services/ai-sentinel';
import { AiNotConfiguredNotice } from '@/components/ui/ai-not-configured';
import { SkeletonSwap } from '@/components/ui/skeleton-swap';
import { DetailCard } from '@/components/ui/detail-card';

interface ThreadSummaryCardProps {
  threadId: string;
  initialSummary?: string | null;
  className?: string;
}

const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_MS = 90_000;
const SUMMARY_UNAVAILABLE = 'Summary unavailable.';

export function ThreadSummaryCard({ threadId, initialSummary, className }: ThreadSummaryCardProps) {
  const router = useRouter();
  const summary = initialSummary ?? null;
  const [isPending, setIsPending] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  const mountedRef = useRef(true);
  const isPendingRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const summaryAtRequestRef = useRef<string | null | undefined>(initialSummary);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Stop as soon as ANY summary value appears. With inline (degraded-mode)
    // execution the DB write happens before the POST returns, so the first
    // refresh after the request always carries the result — even if it is the
    // same fallback value as before. Comparing only for "changed" values let a
    // repeated failure poll for the full 90s and report a misleading timeout.
    if (isPendingRef.current && initialSummary) {
      isPendingRef.current = false;
      setIsPending(false);
      setTimedOut(false);
      stopPolling();
    }
  }, [initialSummary, stopPolling]);

  const requestSummary = useCallback(
    async function () {
      if (isPendingRef.current) return;
      isPendingRef.current = true;
      setIsPending(true);
      setTimedOut(false);
      summaryAtRequestRef.current = initialSummary;

      try {
        const response = await fetch('/api/ai/thread-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ threadId }),
        });

        const payload = (await response.json()) as {
          success: boolean;
          error?: { message?: string };
        };

        if (!mountedRef.current) return;

        if (!response.ok || !payload.success) {
          throw new Error(payload.error?.message || `Request failed: ${response.status}`);
        }

        toasts.info('Generating summary…');

        pollTimerRef.current = setInterval(() => {
          router.refresh();
        }, POLL_INTERVAL_MS);

        timeoutTimerRef.current = setTimeout(() => {
          if (!mountedRef.current) return;
          stopPolling();
          isPendingRef.current = false;
          setIsPending(false);
          setTimedOut(true);
        }, MAX_POLL_MS);
      } catch (error) {
        if (!mountedRef.current) return;
        const message =
          error instanceof Error ? error.message : 'Failed to generate summary. Please try again.';
        toasts.error(message);
        isPendingRef.current = false;
        setIsPending(false);
      }
    },
    [threadId, router, initialSummary, stopPolling]
  );

  return (
    <DetailCard className={cn('relative', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-brand" />
          <span className="text-xs font-bold uppercase tracking-widest text-brand">
            Sai Summary
          </span>
        </div>

        {summary && !isPending && (
          <button type="button"
            className="h-6 w-6 text-muted-foreground hover:text-brand"
            onClick={() => void requestSummary()}
            aria-label="Refresh summary"
          >
            <RefreshCw size={12} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="relative z-10">
        <SkeletonSwap
          ready={!isPending}
          lines={3}
          barHeight={12}
          lineHeight={20}
          label="Sai summary"
        >
          {timedOut ? (
            <div className="flex flex-col items-center justify-center py-2 text-center">
              <p className="text-xs text-muted-foreground mb-3">
                This is taking longer than expected. You can try again.
              </p>
            <button type="button"
              onClick={() => void requestSummary()}
              className="w-full bg-brand/10 border-brand/20 text-brand hover:bg-brand/15 hover:text-brand/90 font-medium text-xs h-8"
            >
              <Sparkles size={12} className="mr-2" />
              Try Again
            </button>
            </div>
          ) : summary ? (
            isAiNotConfigured(summary) ? (
              <AiNotConfiguredNotice />
            ) : summary === SUMMARY_UNAVAILABLE ? (
              <div className="flex flex-col items-center justify-center py-2 text-center">
                <p className="text-xs text-muted-foreground mb-3">
                  Sai couldn&apos;t generate a summary this time. Please try again.
                </p>
              <button type="button"
                onClick={() => void requestSummary()}
                className="w-full bg-brand/10 border-brand/20 text-brand hover:bg-brand/15 hover:text-brand/90 font-medium text-xs h-8"
              >
                <Sparkles size={12} className="mr-2" />
                Try Again
              </button>
              </div>
            ) : (
              <div className="prose prose-sm prose-neutral max-w-none">
                <p className="text-xs text-brand/80 leading-relaxed">{summary}</p>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center py-2 text-center">
              <p className="text-xs text-muted-foreground mb-3">
                Get a quick Sai-powered summary of this thread.
              </p>
            <button type="button"
              onClick={() => void requestSummary()}
              className="w-full bg-brand/10 border-brand/20 text-brand hover:bg-brand/15 hover:text-brand/90 font-medium text-xs h-8"
            >
              <Sparkles size={12} className="mr-2" />
              Generate Summary
            </button>
            </div>
          )}
        </SkeletonSwap>
      </div>
    </DetailCard>
  );
}

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
import { toasts } from '@/lib/utils/toast';
import { cn } from '@/lib/utils/cn';
import { isAiNotConfigured } from '@/lib/services/ai-sentinel';
import { AiNotConfiguredNotice } from '@/components/ui/ai-not-configured';
import { SkeletonSwap } from '@/components/ui/skeleton-swap';
import { DetailCard } from '@/components/ui/detail-card';
import { Button } from '@/components/ui/button';

interface ThreadSummaryCardProps {
  threadId: string;
  initialSummary?: string | null;
  messageCount?: number;
  className?: string;
}

// Poll every 3 seconds while waiting for summary generation
const POLL_INTERVAL_MS = 3_000;
// Stop polling after 90 seconds and show timeout UI
const TIMEOUT_MS = 90_000;
const SUMMARY_UNAVAILABLE = 'Summary unavailable.';

export function ThreadSummaryCard({ threadId, initialSummary, messageCount, className }: ThreadSummaryCardProps) {
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
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = null;
    if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    timeoutTimerRef.current = null;
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
          // Inline stop logic — clear both timers explicitly without indirection
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
          timeoutTimerRef.current = null;
          isPendingRef.current = false;
          setIsPending(false);
          setTimedOut(true);
        }, TIMEOUT_MS);
      } catch (error) {
        if (!mountedRef.current) return;
        const message =
          error instanceof Error ? error.message : 'Failed to generate summary. Please try again.';
        toasts.error(message);
        isPendingRef.current = false;
        setIsPending(false);
      }
    },
    [threadId, router, initialSummary]
  );

  return (
    <DetailCard className={cn('relative', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-sai-accent" />
          <span className="text-xs font-bold uppercase tracking-widest text-sai-accent">
            Sai Summary
          </span>
        </div>

        {summary && !isPending && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => void requestSummary()}
            aria-label="Refresh summary"
          >
            <RefreshCw size={12} />
          </Button>
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
            <div className="flex flex-col items-center justify-center py-3 text-center">
              <div className="flex items-center justify-center size-8 rounded-full bg-amber-100 dark:bg-amber-900/30 mb-2">
                <AlertCircle size={16} className="text-amber-600 dark:text-amber-400" aria-hidden />
              </div>
              <p className="text-sm font-semibold text-ink">Failed — Try Again</p>
              <p className="text-xs text-ink-2 mb-3">This is taking longer than expected. You can try again.</p>
              <Button
                variant="outline"
                size="sm"
                className="w-full bg-sai-accent-tint border-sai-accent/20 text-sai-accent hover:bg-sai-accent-tint"
                onClick={() => void requestSummary()}
              >
                <RefreshCw size={12} className="mr-2" />
                Try Again
              </Button>
            </div>
          ) : summary ? (
            isAiNotConfigured(summary) ? (
              <AiNotConfiguredNotice />
            ) : summary === SUMMARY_UNAVAILABLE ? (
              <div className="flex flex-col items-center justify-center py-3 text-center">
                <div className="flex items-center justify-center size-8 rounded-full bg-amber-100 dark:bg-amber-900/30 mb-2">
                  <AlertCircle size={16} className="text-amber-600 dark:text-amber-400" aria-hidden />
                </div>
                <p className="text-sm font-semibold text-ink">Failed — Try Again</p>
                <p className="text-xs text-ink-2 mb-3">Sai couldn&apos;t generate a summary this time. Please try again.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full bg-sai-accent-tint border-sai-accent/20 text-sai-accent hover:bg-sai-accent-tint"
                  onClick={() => void requestSummary()}
                >
                  <RefreshCw size={12} className="mr-2" />
                  Try Again
                </Button>
              </div>
            ) : (
              <div className="prose prose-sm prose-neutral max-w-none">
                <p className="text-xs text-sai-accent/80 leading-relaxed">{summary}</p>
              </div>
            )
          ) : messageCount !== undefined && messageCount < 20 ? (
            <div className="flex flex-col items-center justify-center py-3 text-center">
              <div className="flex items-center justify-center size-8 rounded-full bg-sai-accent-tint mb-2">
                <Sparkles size={16} className="text-sai-accent" aria-hidden />
              </div>
              <p className="text-sm font-semibold text-ink">Summary unlocks at 20 messages</p>
              <p className="text-xs text-ink-2 mb-2">{20 - messageCount} more message{(20 - messageCount) !== 1 ? 's' : ''} to go — keep the conversation going.</p>
              <div className="w-full h-1.5 rounded-full bg-field overflow-hidden mb-3">
                <div className="h-full bg-sai-accent transition-[width] duration-500" style={{ width: `${Math.round((messageCount / 20) * 100)}%` }} />
              </div>
              <p className="text-xs text-ink-3">Sai needs a bit more context to synthesize well (resolution & DNA work from the first reply).</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-3 text-center">
              <div className="flex items-center justify-center size-8 rounded-full bg-sai-accent-tint mb-2">
                <Sparkles size={16} className="text-sai-accent" aria-hidden />
              </div>
              <p className="text-sm font-semibold text-ink">Not yet scored — Generate</p>
              <p className="text-xs text-ink-2 mb-3">Get a quick Sai-powered summary of this thread.</p>
              <Button
                variant="outline"
                size="sm"
                className="w-full bg-sai-accent-tint border-sai-accent/20 text-sai-accent hover:bg-sai-accent-tint"
                onClick={() => void requestSummary()}
              >
                <Sparkles size={12} className="mr-2" />
                Generate Summary
              </Button>
            </div>
          )}
        </SkeletonSwap>
      </div>
    </DetailCard>
  );
}

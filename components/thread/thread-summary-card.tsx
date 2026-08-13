'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toasts } from '@/lib/utils/toast';
import { cn } from '@/lib/utils';
import { isAiNotConfigured } from '@/lib/services/ai-sentinel';
import { AiNotConfiguredNotice } from '@/components/ui/ai-not-configured';

interface ThreadSummaryCardProps {
  threadId: string;
  initialSummary?: string | null;
  className?: string;
}

const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_MS = 90_000;

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
    if (isPendingRef.current && initialSummary !== summaryAtRequestRef.current) {
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
    <div
      className={cn(
        'rounded-xl border p-5 relative overflow-hidden bg-background/50 shadow-linear-sm',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-brand" />
          <span className="text-xs font-bold uppercase tracking-widest text-brand">
            Sai Summary
          </span>
        </div>

        {summary && !isPending && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-brand"
            onClick={() => void requestSummary()}
            title="Refresh summary"
          >
            <RefreshCw size={12} />
          </Button>
        )}
      </div>

      {/* Body */}
      <div className="relative z-10">
        {isPending ? (
          <div className="space-y-2">
            <div className="animate-pulse space-y-2">
              <div className="h-3 bg-muted rounded w-full" />
              <div className="h-3 bg-muted rounded w-5/6" />
              <div className="h-3 bg-muted rounded w-4/6" />
            </div>
            <p className="text-xs text-muted-foreground/70">Sai is reading the thread…</p>
          </div>
        ) : timedOut ? (
          <div className="flex flex-col items-center justify-center py-2 text-center">
            <p className="text-xs text-muted-foreground mb-3">
              This is taking longer than expected. You can try again.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void requestSummary()}
              className="w-full bg-brand/10 border-brand/20 text-brand hover:bg-brand/15 hover:text-brand/90 font-medium text-xs h-8"
            >
              <Sparkles size={12} className="mr-2" />
              Try Again
            </Button>
          </div>
        ) : summary ? (
          isAiNotConfigured(summary) ? (
            <AiNotConfiguredNotice />
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
            <Button
              size="sm"
              variant="outline"
              onClick={() => void requestSummary()}
              className="w-full bg-brand/10 border-brand/20 text-brand hover:bg-brand/15 hover:text-brand/90 font-medium text-xs h-8"
            >
              <Sparkles size={12} className="mr-2" />
              Generate Summary
            </Button>
          </div>
        )}
      </div>

      {/* Decorative blur */}
      <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-brand/10 blur-2xl rounded-full pointer-events-none" />
    </div>
  );
}

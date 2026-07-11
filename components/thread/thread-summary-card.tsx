'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toasts } from '@/lib/utils/toast';
import { cn } from '@/lib/utils';
import { isAiNotConfigured } from '@/lib/services/ai';
import { AiNotConfiguredNotice } from '@/components/ui/ai-not-configured';

interface ThreadSummaryCardProps {
  threadId: string;
  initialSummary?: string | null;
  className?: string;
}

// Poll interval in ms — exponential backoff from 1s to 10s
const POLL_INTERVAL_MS = 10_000;
// Maximum time to wait for a job before giving up (30 seconds)
const POLL_TIMEOUT_MS = 30_000;

export function ThreadSummaryCard({ threadId, initialSummary, className }: ThreadSummaryCardProps) {
  const [summary, setSummary] = useState(initialSummary ?? null);
  const [isLoading, setIsLoading] = useState(false);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const isLoadingRef = useRef(false);

  function stopPolling() {
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }

  const startPolling = useCallback(function startPolling(jobId: string) {
    // Clear any existing interval before starting a new one
    stopPolling();
    pollStartRef.current = Date.now();

    const pollInterval = setInterval(async () => {
      // Timeout guard — stop polling after POLL_TIMEOUT_MS
      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        stopPolling();
        if (pollIntervalRef.current !== null) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (mountedRef.current) {
          setIsLoading(false);
          toasts.error('Summary is taking too long. Try again in a moment.');
        }
        return;
      }

      try {
        const response = await fetch(`/api/ai/jobs?jobId=${jobId}`);
        if (!response.ok || !mountedRef.current) return;

        const jobData = (await response.json()) as {
          state: string;
          result?: { summary?: string };
        };

        if (jobData.state === 'completed') {
          stopPolling();
          if (mountedRef.current) {
            setSummary(jobData.result?.summary ?? null);
            setIsLoading(false);
            toasts.success('Thread summary generated!'); 
            // Do NOT call router.refresh() here — local state already updated.
            // Only call router.refresh() if server-rendered counts need updating.
          }
        } else if (jobData.state === 'failed') {
          stopPolling();
          if (mountedRef.current) {
            setIsLoading(false);
            toasts.error('Failed to generate summary. Please try again.');
          }
        }
        // "waiting" | "active" | "delayed" → keep polling
      } catch {
        // Network error during poll — keep trying until timeout
      }
    }, POLL_INTERVAL_MS);
    
    pollIntervalRef.current = pollInterval;
    return pollInterval;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, []);

  const requestSummary = useCallback(async function () {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/thread-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId }),
      });

      if (!mountedRef.current) return;

      if (!response.ok) {
        const errorData = (await response.json()) as { message?: string };
        throw new Error(errorData.message || `Request failed: ${response.status}`);
      }

      const data = (await response.json()) as { jobId?: string };

      if (data.jobId) {
        startPolling(data.jobId);
      } else {
        setIsLoading(false);
        isLoadingRef.current = false;
      }
    } catch (error) {
      if (!mountedRef.current) return;
      setIsLoading(false);
      isLoadingRef.current = false;
      const message = error instanceof Error ? error.message : 'Failed to generate summary. Please try again.';
      toasts.error(message);
    }
  }, [threadId, startPolling]);

  return (
    <div
      className={cn('rounded-xl border p-5 relative overflow-hidden bg-background/50', className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-brand" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-brand">
            AI Summary
          </span>
        </div>

        {summary && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-400 hover:text-brand"
            onClick={() => void requestSummary()}
            disabled={isLoading}
            title="Refresh summary"
          >
            <RefreshCw size={12} className={cn(isLoading && 'animate-spin')} />
          </Button>
        )}
      </div>

      {/* Body */}
      <div className="relative z-10">
        {isLoading ? (
          // Skeleton while generating — matches rendered summary height
          <div className="space-y-2 animate-pulse">
            <div className="h-3 bg-muted rounded w-full" />
            <div className="h-3 bg-muted rounded w-5/6" />
            <div className="h-3 bg-muted rounded w-4/6" />
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
              Get a quick AI-powered summary of this thread.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void requestSummary()}
              disabled={isLoading}
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

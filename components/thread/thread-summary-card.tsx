'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ThreadSummaryCardProps {
  threadId: string;
  initialSummary?: string | null;
  className?: string;
}

// Poll interval in ms — how often we check if the BullMQ job is done
const POLL_INTERVAL_MS = 2_000;
// Maximum time to wait for a job before giving up (30 seconds)
const POLL_TIMEOUT_MS = 30_000;

export function ThreadSummaryCard({ threadId, initialSummary, className }: ThreadSummaryCardProps) {
  const [summary, setSummary] = useState(initialSummary ?? null);
  const [isLoading, setIsLoading] = useState(false);

  // Single shared ref for the active polling interval — prevents leaks
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks total time spent polling so we can time out
  const pollStartRef = useRef<number>(0);
  // Prevents setState after unmount
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, []);

  // ── POLLING ───────────────────────────────────────────────────────────────

  function stopPolling() {
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }

  function startPolling(jobId: string) {
    // Clear any existing interval before starting a new one
    stopPolling();
    pollStartRef.current = Date.now();

    pollIntervalRef.current = setInterval(async () => {
      // Timeout guard — stop polling after POLL_TIMEOUT_MS
      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        stopPolling();
        if (mountedRef.current) {
          setIsLoading(false);
          toast.error('Summary is taking too long. Try again in a moment.');
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
            toast.success('Thread summary generated!');
            // Do NOT call router.refresh() here — local state already updated.
            // Only call router.refresh() if server-rendered counts need updating.
          }
        } else if (jobData.state === 'failed') {
          stopPolling();
          if (mountedRef.current) {
            setIsLoading(false);
            toast.error('Failed to generate summary. Please try again.');
          }
        }
        // "waiting" | "active" | "delayed" → keep polling
      } catch {
        // Network error during poll — keep trying until timeout
        if (process.env.NODE_ENV === 'development') {
          console.warn('[ThreadSummaryCard] Poll request failed, retrying...');
        }
      }
    }, POLL_INTERVAL_MS);
  }

  // ── FETCH SUMMARY ─────────────────────────────────────────────────────────

  async function requestSummary() {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/thread-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId }),
      });

      if (!mountedRef.current) return;

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const data = (await response.json()) as { jobId?: string };

      if (data.jobId) {
        startPolling(data.jobId);
        // isLoading stays true — polling will clear it
      } else {
        // Job was synchronous or summary already existed
        setIsLoading(false);
      }
    } catch {
      if (!mountedRef.current) return;
      setIsLoading(false);
      toast.error('Failed to generate summary. Please try again.');
    }
  }

  // Auto-request summary on mount only if none was provided by the server
  useEffect(() => {
    if (!initialSummary) {
      void requestSummary();
    }
    // Only run on mount — requestSummary intentionally excluded from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div
      className={cn('rounded-xl border p-5 relative overflow-hidden bg-background/50', className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-indigo-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-700">
            AI Summary
          </span>
        </div>

        {summary && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-400 hover:text-indigo-600"
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
          <div className="prose prose-sm prose-indigo max-w-none">
            <p className="text-xs text-indigo-900/80 leading-relaxed">{summary}</p>
          </div>
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
              className="w-full bg-indigo-50/50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 font-medium text-xs h-8"
            >
              <Sparkles size={12} className="mr-2" />
              Generate Summary
            </Button>
          </div>
        )}
      </div>

      {/* Decorative blur */}
      <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-indigo-500/10 blur-2xl rounded-full pointer-events-none" />
    </div>
  );
}

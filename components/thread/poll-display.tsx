'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { voteOnPollAction, getUserVoteAction, getPollResultsAction } from '@/modules/polls/actions';
import { toasts } from '@/lib/utils/toast';
import { CheckCircle2, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { TimeAgo } from '@/components/ui/TimeAgo';
import type { PollResults } from '@/modules/polls/types';

interface PollDisplayProps {
  poll: {
    id: string;
    threadId: string;
    question: string;
    options: string[];
    isActive: boolean;
    expiresAt: Date | null;
  };
  /** Fresh results from parent's poll tick — skips internal fetch when provided. */
  pollResults?: PollResults | null;
  /** Increment to trigger a re-fetch of results. */
  refreshKey?: number;
}

function PollSkeleton({ optionCount }: { optionCount: number }) {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-5 w-3/4 bg-muted rounded" />
      <div className="space-y-2">
        {Array.from({ length: optionCount }).map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="h-4 w-1/2 bg-muted rounded" />
            <div className="h-2 w-full bg-muted rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PollDisplay({ poll, pollResults, refreshKey }: PollDisplayProps) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [results, setResults] = useState<PollResults | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVoting, setIsVoting] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadPollData = useCallback(async () => {
    if (!mountedRef.current) return;

    // If parent provides fresh results (from poll tick), use them directly
    if (pollResults) {
      setResults(pollResults);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      // Both requests fire in parallel
      const [voteResult, resultsResult] = await Promise.all([
        getUserVoteAction(poll.id),
        getPollResultsAction(poll.id),
      ]);

      if (!mountedRef.current) return;

      if (voteResult?.data) {
        setSelectedOption(voteResult.data.optionIndex);
        setHasVoted(true);
      }

      if (resultsResult?.data) {
        setResults(resultsResult.data);
      } else if (resultsResult?.error) {
        toasts.error('Failed to load poll results.', 'Try refreshing the page.');
      }
    } catch {
      if (!mountedRef.current) return;
      toasts.error('Failed to load poll results.', 'Try refreshing the page.');
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [poll.id, pollResults]);

  // loadPollData is now stable (useCallback with [poll.id])
  // so this effect only runs once per poll.id change or refreshKey bump
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadPollData();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPollData, refreshKey]);

  const handleVote = async (optionIndex: number) => {
    if (hasVoted || isVoting) return;

    setIsVoting(true);
    try {
      const result = await voteOnPollAction(poll.id, optionIndex);
      if (!mountedRef.current) return;

      if (result?.error) {
        toasts.error(result.error);
      } else {
        setSelectedOption(optionIndex);
        setHasVoted(true);
        // "saved" is misleading for a vote action
        toasts.success('Vote recorded!');
        // Reload results to show updated counts
        await loadPollData();
      }
    } catch {
      if (mountedRef.current) toasts.serverError();
    } finally {
      if (mountedRef.current) setIsVoting(false);
    }
  };

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const isExpired = !!poll.expiresAt && new Date(poll.expiresAt).getTime() <= now;
  const showResults = hasVoted || !poll.isActive || isExpired;

  if (isLoading) {
    return <PollSkeleton optionCount={poll.options.length} />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[12px] border border-border bg-(--surface) p-5 space-y-4 shadow-sm max-w-lg"
    >
      <div className="flex items-start justify-between">
        <h3 className="text-[14px] font-semibold text-(--text) tracking-tight">{poll.question}</h3>
        {showResults && <BarChart3 className="h-4 w-4 text-muted-foreground shrink-0" />}
      </div>

      <div className="space-y-2.5" role="radiogroup" aria-label={poll.question}>
        {poll.options.map((option, index) => {
          const result = results?.results.find((r) => r.index === index);
          const percentage = result?.percentage ?? 0;
          const isSelected = selectedOption === index;

          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.04 }}
            >
              {showResults ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="flex items-center gap-1.5 text-(--text) font-medium">
                      {option}
                      {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-(--blue)" />}
                    </span>
                    <span className="text-muted-foreground font-(--font-dm-mono) text-[11px] tabular-nums">
                      {result?.votes ?? 0} votes ({percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-[6px] bg-muted/40 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.5, delay: index * 0.08 }}
                      className={cn(
                        'h-full rounded-full',
                        isSelected ? 'bg-(--blue)' : 'bg-(--text)'
                      )}
                    />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleVote(index)}
                  disabled={isVoting || hasVoted || !poll.isActive || isExpired}
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={`Vote for: ${option}`}
                  className={cn(
                    'w-full text-left px-3.5 py-2 rounded-[8px] border text-[13px] font-medium transition-all duration-200',
                    isSelected
                      ? 'bg-(--blue-dim) border-(--blue) text-(--blue)'
                      : 'bg-transparent border-border/60 text-(--text) hover:border-border hover:bg-muted/10 disabled:opacity-50'
                  )}
                >
                  {option}
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      {poll.expiresAt && (
        <p className="text-[11px] font-(--font-dm-mono) uppercase tracking-wider text-muted-foreground">
          Poll expires <TimeAgo date={poll.expiresAt} />
        </p>
      )}
    </motion.div>
  );
}

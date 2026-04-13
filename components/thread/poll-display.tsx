"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  voteOnPollAction,
  getUserVoteAction,
  getPollResultsAction,
} from "@/modules/polls/actions";
import { toasts } from "@/lib/utils/toast";
import { CheckCircle2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { TimeAgo } from "@/components/ui/TimeAgo";
import type { PollResults } from "@/modules/polls/types";

// ── TYPES ──────────────────────────────────────────────────────────────────

interface PollDisplayProps {
  poll: {
    id: string;
    threadId: string;
    question: string;
    options: string[];
    isActive: boolean;
    expiresAt: Date | null;
  };
}

// ── SKELETON ───────────────────────────────────────────────────────────────
// Matches the height of a typical 2-option poll to prevent layout shift.

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

// ── COMPONENT ──────────────────────────────────────────────────────────────

export function PollDisplay({ poll }: PollDisplayProps) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [results, setResults] = useState<PollResults | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVoting, setIsVoting] = useState(false);

  // Prevents setState on unmounted component
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── DATA LOADING ─────────────────────────────────────────────────────────

  const loadPollData = useCallback(async () => {
    if (!mountedRef.current) return;
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
        toasts.error("Failed to load poll results.", "Try refreshing the page.");
      }
    } catch {
      if (!mountedRef.current) return;
      toasts.error("Failed to load poll results.", "Try refreshing the page.");
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [poll.id]); // poll.id is stable — only re-creates if poll changes

  // loadPollData is now stable (useCallback with [poll.id])
  // so this effect only runs once per poll.id change
  useEffect(() => {
    void loadPollData();
  }, [loadPollData]);

  // ── VOTE HANDLER ─────────────────────────────────────────────────────────

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
        toasts.success("Vote recorded!");
        // Reload results to show updated counts
        await loadPollData();
      }
    } catch {
      if (mountedRef.current) toasts.serverError();
    } finally {
      if (mountedRef.current) setIsVoting(false);
    }
  };

  // ── RENDER ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return <PollSkeleton optionCount={poll.options.length} />;
  }

  const isExpired =
    !!poll.expiresAt && new Date(poll.expiresAt).getTime() <= Date.now();
  const showResults = hasVoted || !poll.isActive || isExpired;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border bg-card p-6 space-y-4"
    >
      <div className="flex items-start justify-between">
        <h3 className="text-lg font-semibold text-foreground">
          {poll.question}
        </h3>
        {showResults && (
          <BarChart3 className="h-5 w-5 text-muted-foreground shrink-0" />
        )}
      </div>

      <div className="space-y-2">
        {poll.options.map((option, index) => {
          const result = results?.results.find((r) => r.index === index);
          const percentage = result?.percentage ?? 0;
          const isSelected = selectedOption === index;

          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              {showResults ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      {option}
                      {isSelected && (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      )}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {result?.votes ?? 0} votes ({percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                      className={cn(
                        "h-full rounded-full",
                        isSelected
                          ? "bg-primary"
                          : "bg-muted-foreground/50"
                      )}
                    />
                  </div>
                </div>
              ) : (
                <Button
                  onClick={() => handleVote(index)}
                  disabled={isVoting || hasVoted || !poll.isActive || isExpired}
                  variant={isSelected ? "default" : "outline"}
                  className="w-full justify-start"
                >
                  {option}
                </Button>
              )}
            </motion.div>
          );
        })}
      </div>

      {poll.expiresAt && (
        <p className="text-xs text-muted-foreground">
          Poll expires <TimeAgo date={poll.expiresAt} />
        </p>
      )}
    </motion.div>
  );
}
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { voteOnPollAction, getUserVoteAction, getPollResultsAction } from '@/modules/polls/actions';
import { toasts } from '@/lib/utils/toast';
import { BarChart3 } from 'lucide-react';
import { TimeAgo } from '@/components/ui/TimeAgo';
import { PollResults } from '@/components/interior/poll-results';
import type { PollResults as PollResultsType } from '@/modules/polls/types';

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
  pollResults?: PollResultsType | null;
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
  const [results, setResults] = useState<PollResultsType | null>(null);
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

    if (pollResults) {
      setResults(pollResults);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadPollData();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPollData, refreshKey]);

  const handleVote = async (optionId: string) => {
    if (hasVoted || isVoting) return;

    const optionIndex = poll.options.findIndex((_, i) => `${poll.id}-opt-${i}` === optionId);
    if (optionIndex === -1) return;

    setIsVoting(true);
    try {
      const result = await voteOnPollAction(poll.id, optionIndex);
      if (!mountedRef.current) return;

      if (result?.error) {
        toasts.error(result.error);
      } else {
        setSelectedOption(optionIndex);
        setHasVoted(true);
        toasts.success('Vote recorded!');
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

  const pollOptions = poll.options.map((option, index) => ({
    id: `${poll.id}-opt-${index}`,
    label: option,
    votes: results?.results.find((r) => r.index === index)?.votes ?? 0,
  }));

  const totalVotes = pollOptions.reduce((sum, opt) => sum + opt.votes, 0);

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm max-w-lg">
      <div className="flex items-start justify-between">
        <h3 className="text-sm font-semibold text-foreground tracking-tight">{poll.question}</h3>
        {showResults && <BarChart3 className="h-4 w-4 text-muted-foreground shrink-0" />}
      </div>

      <PollResults
        label={poll.question}
        options={pollOptions}
        value={showResults && selectedOption !== null ? `${poll.id}-opt-${selectedOption}` : null}
        onVote={isVoting || hasVoted || !poll.isActive || isExpired ? undefined : handleVote}
      />

      {poll.expiresAt && (
        <p className="text-xs font-(--font-dm-mono) uppercase tracking-wider text-muted-foreground">
          Poll expires <TimeAgo date={poll.expiresAt} />
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
      </p>
    </div>
  );
}

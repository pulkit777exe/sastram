'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getPollByThreadAction, getPollResultsAction } from '@/modules/polls/actions';
import type { PollResults } from '@/modules/polls/types';

export interface PollViewModel {
  id: string;
  question: string;
  options: string[];
  isActive: boolean;
  expiresAt: Date | null;
}

interface UsePollRefreshOptions {
  threadId: string;
  initialPoll: PollViewModel | null;
}

/**
 * Poll UI state + refresh. No timer of its own: the shared thread scheduler
 * (use-thread-polling, via use-thread-sync `onPollTick`) drives `refreshPoll`
 * on every visible tick, so backfill and poll refresh share one clock that
 * already pauses when the tab is hidden.
 */
export function usePollRefresh({ threadId, initialPoll }: UsePollRefreshOptions) {
  const [currentPoll, setCurrentPoll] = useState<PollViewModel | null>(initialPoll);
  const [pollResults, setPollResults] = useState<PollResults | null>(null);
  const [pollRefreshKey, setPollRefreshKey] = useState(0);
  const pollRef = useRef(currentPoll);
  useEffect(() => {
    pollRef.current = currentPoll;
  }, [currentPoll]);
  const cancelledRef = useRef(false);
  useEffect(() => () => { cancelledRef.current = true; }, []);

  const refreshPoll = useCallback(async () => {
    const poll = pollRef.current;
    if (!poll || cancelledRef.current) return;
    try {
      const [freshPollResult, freshResultsResult] = await Promise.all([
        getPollByThreadAction({ threadId }),
        getPollResultsAction({ pollId: poll.id }),
      ]);
      if (cancelledRef.current) return;
      if (freshPollResult?.data) {
        const freshPoll = freshPollResult.data;
        setCurrentPoll((prev) =>
          prev ? { ...prev, isActive: freshPoll.isActive, expiresAt: freshPoll.expiresAt } : prev
        );
      }
      if (freshResultsResult?.data) {
        setPollResults(freshResultsResult.data);
        setPollRefreshKey((k) => k + 1);
      }
    } catch {
      // best-effort
    }
  }, [threadId]);

  return { currentPoll, setCurrentPoll, pollResults, setPollResults, pollRefreshKey, refreshPoll };
}

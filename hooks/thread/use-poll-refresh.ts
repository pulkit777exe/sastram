'use client';

import { useEffect, useState } from 'react';
import { getPollByThreadAction, getPollResultsAction } from '@/modules/polls/actions';
import type { PollResults } from '@/modules/polls/types';

export const POLL_REFRESH_MS = 20_000;

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

export function usePollRefresh({ threadId, initialPoll }: UsePollRefreshOptions) {
  const [currentPoll, setCurrentPoll] = useState<PollViewModel | null>(initialPoll);
  const [pollResults, setPollResults] = useState<PollResults | null>(null);
  const [pollRefreshKey, setPollRefreshKey] = useState(0);

  useEffect(() => {
    if (!currentPoll) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (cancelled) return;
      try {
        const pollId = currentPoll.id;
        const [freshPollResult, freshResultsResult] = await Promise.all([
          getPollByThreadAction({ threadId }),
          getPollResultsAction({ pollId }),
        ]);
        if (cancelled) return;
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
    }, POLL_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentPoll, threadId]);

  return { currentPoll, setCurrentPoll, pollResults, setPollResults, pollRefreshKey };
}

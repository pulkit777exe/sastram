'use client';

import { useEffect } from 'react';
import { backfillThreadMessages } from '@/modules/threads/actions';
import type { Message } from '@/lib/types/index';

interface UseThreadPollingOptions {
  threadId: string;
  lastMessageTimestampRef: React.MutableRefObject<string>;
  aiInlineStatusRef: React.MutableRefObject<Record<string, 'pending' | 'failed'>>;
  liveMessagesRef: React.MutableRefObject<Message[]>;
  mapBackfillMessage: (m: import('@/modules/threads/service').ThreadMessage) => Message;
  mergeBackfill: (newMessages: Message[]) => boolean;
  onAiStatusCleared?: (parentId: string) => void;
}

/**
 * Adaptive polling for new thread messages.
 *
 * Uses a base interval (20s) that backs off to 60s after 3 empty polls,
 * and switches to fast mode (3s) when AI inline responses are pending.
 * Pauses when the tab is hidden.
 */
export function useThreadPolling({
  threadId,
  lastMessageTimestampRef,
  aiInlineStatusRef,
  liveMessagesRef: _liveMessagesRef,
  mapBackfillMessage,
  mergeBackfill,
  onAiStatusCleared,
}: UseThreadPollingOptions) {
  useEffect(() => {
    const BASE_INTERVAL = 20_000;
    const FAST_INTERVAL = 3_000;
    const MAX_INTERVAL = 60_000;
    const BACKOFF_MULTIPLIER = 2;
    const BACKOFF_THRESHOLD = 3;

    let currentInterval = BASE_INTERVAL;
    let emptyPollCount = 0;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const hasPendingAi = () => Object.values(aiInlineStatusRef.current).includes('pending');

    async function pollOnce() {
      const fastMode = hasPendingAi();
      try {
        const since = lastMessageTimestampRef.current;
        const result = await backfillThreadMessages({ threadId, since });

        if (!result?.ok || !result.data?.messages?.length) {
          if (!fastMode) {
            emptyPollCount++;
            if (emptyPollCount >= BACKOFF_THRESHOLD) {
              currentInterval = Math.min(currentInterval * BACKOFF_MULTIPLIER, MAX_INTERVAL);
            }
          }
          return;
        }

        const newMessages: Message[] = result.data.messages.map(mapBackfillMessage);
        const hasNew = mergeBackfill(newMessages);

        if (hasNew) {
          emptyPollCount = 0;
          currentInterval = BASE_INTERVAL;
          for (const msg of newMessages) {
            if (msg.isAiResponse && msg.parentId && msg.content.trim().length > 0) {
              setTimeout(() => onAiStatusCleared?.(msg.parentId!), 0);
            }
          }
        } else if (!fastMode) {
          emptyPollCount++;
          if (emptyPollCount >= BACKOFF_THRESHOLD) {
            currentInterval = Math.min(currentInterval * BACKOFF_MULTIPLIER, MAX_INTERVAL);
          }
        }
      } catch {
        // Silent — poll is best-effort
      }
    }

    function scheduleNext() {
      if (cancelled) return;
      const delay = hasPendingAi() ? FAST_INTERVAL : currentInterval;
      timeoutId = setTimeout(async () => {
        if (document.visibilityState === 'visible') {
          await pollOnce();
        }
        scheduleNext();
      }, delay);
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        if (timeoutId) clearTimeout(timeoutId);
        pollOnce().finally(scheduleNext);
      }
    }

    pollOnce().finally(scheduleNext);

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [threadId, mapBackfillMessage, mergeBackfill, lastMessageTimestampRef, aiInlineStatusRef, onAiStatusCleared]);
}

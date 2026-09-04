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

// Adaptive polling: 20s base → 60s after 3 empty polls, 3s when AI pending, paused when tab hidden
const BASE_INTERVAL_MS = 20_000;
const FAST_INTERVAL_MS = 3_000;
const MAX_INTERVAL_MS = 60_000;
const BACKOFF_MULTIPLIER = 2;
const BACKOFF_THRESHOLD = 3;

function syncThreadPolling(options: UseThreadPollingOptions): () => void {
  const {
    threadId,
    lastMessageTimestampRef,
    aiInlineStatusRef,
    mapBackfillMessage,
    mergeBackfill,
    onAiStatusCleared,
  } = options;

  let currentInterval = BASE_INTERVAL_MS;
  let emptyPollCount = 0;
  let cancelled = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  // Single poll attempt — updates backoff counters and merges new messages
  async function pollOnce(): Promise<void> {
    const isFastMode = Object.values(aiInlineStatusRef.current).includes('pending');
    try {
      const since = lastMessageTimestampRef.current;
      const result = await backfillThreadMessages({ threadId, since });

      const hasNoMessages = !result?.ok || !result.data?.messages?.length;
      if (hasNoMessages) {
        if (!isFastMode) {
          emptyPollCount++;
          if (emptyPollCount >= BACKOFF_THRESHOLD) {
            currentInterval = Math.min(currentInterval * BACKOFF_MULTIPLIER, MAX_INTERVAL_MS);
          }
        }
        return;
      }

      const newMessages: Message[] = result.data!.messages.map(mapBackfillMessage);
      const hasNew = mergeBackfill(newMessages);

      if (hasNew) {
        emptyPollCount = 0;
        currentInterval = BASE_INTERVAL_MS;
        // Clear AI pending for any AI replies that arrived
        for (const msg of newMessages) {
          if (msg.isAiResponse && msg.parentId && msg.content.trim().length > 0) {
            onAiStatusCleared?.(msg.parentId);
          }
        }
        return;
      }

      if (!isFastMode) {
        emptyPollCount++;
        if (emptyPollCount >= BACKOFF_THRESHOLD) {
          currentInterval = Math.min(currentInterval * BACKOFF_MULTIPLIER, MAX_INTERVAL_MS);
        }
      }
    } catch {
      // best-effort — poll is non-critical
    }
  }

  // Schedule next poll with adaptive delay
  function scheduleNext(): void {
    if (cancelled) return;
    const isFastMode = Object.values(aiInlineStatusRef.current).includes('pending');
    const delay = isFastMode ? FAST_INTERVAL_MS : currentInterval;
    timeoutId = setTimeout(async () => {
      if (document.visibilityState === 'visible') await pollOnce();
      scheduleNext();
    }, delay);
  }

  // Resume immediately when tab becomes visible
  function onVisibilityChange(): void {
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
}

export function useThreadPolling(options: UseThreadPollingOptions): void {
  const { threadId, lastMessageTimestampRef, aiInlineStatusRef, mapBackfillMessage, mergeBackfill, onAiStatusCleared } = options;

  // syncThreadPolling captures stable refs; deps are granular fields
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => syncThreadPolling(options), [
    threadId,
    mapBackfillMessage,
    mergeBackfill,
    lastMessageTimestampRef,
    aiInlineStatusRef,
    onAiStatusCleared,
  ]);
}

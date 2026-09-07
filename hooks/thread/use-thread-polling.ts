'use client';

import { useEffect, useState } from 'react';
import { backfillThreadMessages } from '@/modules/threads/actions';
import type { Message } from '@/lib/types/index';
import { toasts } from '@/lib/utils/toast';

interface UseThreadPollingOptions {
  threadId: string;
  lastMessageTimestampRef: React.MutableRefObject<string>;
  aiInlineStatusRef: React.MutableRefObject<Record<string, 'pending' | 'failed'>>;
  liveMessagesRef: React.MutableRefObject<Message[]>;
  mapBackfillMessage: (m: import('@/modules/threads/service').ThreadMessage) => Message;
  mergeBackfill: (newMessages: Message[]) => boolean;
  onAiStatusCleared?: (parentId: string) => void;
}

interface InternalPollingOptions extends UseThreadPollingOptions {
  onStaleChange?: (stale: boolean) => void;
}

// Adaptive polling: 20s base → 60s after 3 empty polls, 3s when AI pending, paused when tab hidden
const BASE_INTERVAL_MS = 20_000;
const FAST_INTERVAL_MS = 3_000;
const MAX_INTERVAL_MS = 60_000;
const BACKOFF_MULTIPLIER = 2;
const BACKOFF_THRESHOLD = 3;

function syncThreadPolling(options: InternalPollingOptions): () => void {
  const {
    threadId,
    lastMessageTimestampRef,
    aiInlineStatusRef,
    mapBackfillMessage,
    mergeBackfill,
    onAiStatusCleared,
    onStaleChange,
  } = options;

  let currentInterval = BASE_INTERVAL_MS;
  let emptyPollCount = 0;
  let failureCount = 0;
  let cancelled = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  // Single poll attempt — updates backoff counters and merges new messages
  async function pollOnce(): Promise<void> {
    const isFastMode = Object.values(aiInlineStatusRef.current).includes('pending');
    try {
      const since = lastMessageTimestampRef.current;
      const result = await backfillThreadMessages({ threadId, since });
      failureCount = 0;
      onStaleChange?.(false);

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
        failureCount = 0;
        onStaleChange?.(false);
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
      failureCount++;
      if (failureCount === 2) toasts.error('Connection slow — retrying');
      if (failureCount >= 3) {
        currentInterval = Math.min(currentInterval * BACKOFF_MULTIPLIER, MAX_INTERVAL_MS);
        onStaleChange?.(true);
      }
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

export function useThreadPolling(options: UseThreadPollingOptions): boolean {
  const { threadId, lastMessageTimestampRef, aiInlineStatusRef, liveMessagesRef, mapBackfillMessage, mergeBackfill, onAiStatusCleared } = options;
  const [isStale, setIsStale] = useState(false);

  useEffect(
    () =>
      syncThreadPolling({
        threadId,
        lastMessageTimestampRef,
        aiInlineStatusRef,
        liveMessagesRef,
        mapBackfillMessage,
        mergeBackfill,
        onAiStatusCleared,
        onStaleChange: setIsStale,
      }),
    [threadId, liveMessagesRef, mapBackfillMessage, mergeBackfill, lastMessageTimestampRef, aiInlineStatusRef, onAiStatusCleared]
  );

  return isStale;
}

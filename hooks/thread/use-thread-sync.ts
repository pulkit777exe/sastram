'use client';

import { useRef } from 'react';
import { useThreadMessages } from '@/hooks/thread/use-thread-messages';
import { useThreadPolling } from '@/hooks/thread/use-thread-polling';
import { useAiInlineStatus } from '@/hooks/thread/ai-inline-status';
import type { Message } from '@/lib/types/index';

interface UseThreadSyncOptions {
  initialMessages: Message[];
  threadId: string;
  title: string;
  slug: string;
  hasMoreMessages: boolean;
  nextCursor: string | null;
  totalMessageCount: number;
  /** Extra work per visible poll tick (e.g. poll refresh) — one shared clock. */
  onPollTick?: () => Promise<void>;
}

export function useThreadSync({
  initialMessages,
  threadId,
  title,
  slug,
  hasMoreMessages,
  nextCursor,
  totalMessageCount,
  onPollTick,
}: UseThreadSyncOptions) {
  const threadMessages = useThreadMessages({
    initialMessages,
    threadId,
    title,
    slug,
    hasMoreMessages,
    nextCursor,
    totalMessageCount,
  });

  const {
    aiInlineStatus,
    aiInlineStatusRef,
    aiInlineTimerRef,
    setAiPending,
    setAiInlineStatus,
    clearAiStatus,
    markFailedIfPending,
  } = useAiInlineStatus();

  const streamParentRef = useRef<string | null>(null);

  const isPollingStale = useThreadPolling({
    threadId,
    lastMessageTimestampRef: threadMessages.lastMessageTimestampRef,
    aiInlineStatusRef,
    liveMessagesRef: threadMessages.liveMessagesRef,
    mapBackfillMessage: threadMessages.mapBackfillMessage,
    mergeBackfill: threadMessages.mergeBackfill,
    onAiStatusCleared: clearAiStatus,
    onTickExtra: onPollTick,
  });

  return {
    // Message state (includes applyMessagePatch, addMessage routed through it)
    ...threadMessages,
    threadMessages,
    // AI inline status
    aiInlineStatus,
    aiInlineStatusRef,
    aiInlineTimerRef,
    setAiPending,
    setAiInlineStatus,
    clearAiStatus,
    markFailedIfPending,
    // Stream bookkeeping (owned here so wrapper + polling share one ref)
    streamParentRef,
    // Polling health
    isPollingStale,
  };
}

export type UseThreadSyncReturn = ReturnType<typeof useThreadSync>;

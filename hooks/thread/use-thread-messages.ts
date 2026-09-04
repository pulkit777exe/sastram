'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadThreadMessages } from '@/modules/threads/actions';
import { toClientMessage, type ThreadMessage } from '@/modules/threads/service';
import { toasts } from '@/lib/utils/toast';
import type { Message } from '@/lib/types/index';

function buildIdIndex(messages: Message[]): Map<string, number> {
  return new Map(messages.map((m, i) => [m.id, i]));
}

function sortByCreatedAt(messages: Message[]): Message[] {
  return [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

function mergeMessages(prev: Message[], incoming: Message[]): { merged: Message[]; hasNew: boolean } {
  const idToIndex = buildIdIndex(prev);
  let next = prev;
  let hasContentUpdate = false;

  for (const msg of incoming) {
    const existingIndex = idToIndex.get(msg.id);
    const isExistingMessage = existingIndex !== undefined;
    if (!isExistingMessage) {
      continue;
    }

    const hasContentChanged = next[existingIndex as number].content !== msg.content;
    if (hasContentChanged) {
      const isFirstMutation = next === prev;
      if (isFirstMutation) {
        next = [...prev];
      }
      next[existingIndex as number] = { ...next[existingIndex as number], content: msg.content };
      hasContentUpdate = true;
    }
  }

  const newMessages = incoming.filter((m) => !idToIndex.has(m.id));
  const hasNewMessages = newMessages.length > 0;
  const hasAnyChange = hasContentUpdate || hasNewMessages;

  if (!hasAnyChange) {
    return { merged: prev, hasNew: false };
  }

  const merged = sortByCreatedAt([...next, ...newMessages]);
  return { merged, hasNew: true };
}

interface UseThreadMessagesOptions {
  initialMessages: Message[];
  threadId: string;
  title: string;
  slug: string;
  hasMoreMessages: boolean;
  nextCursor: string | null;
  totalMessageCount: number;
}

/**
 * Manages thread message state: live messages, pagination (load more),
 * merge logic for incoming backfilled messages, and optimistic updates.
 */
export function useThreadMessages({
  initialMessages,
  threadId,
  title,
  slug,
  hasMoreMessages: initialHasMore,
  nextCursor: initialNextCursor,
  totalMessageCount,
}: UseThreadMessagesOptions) {
  const [liveMessages, setLiveMessages] = useState<Message[]>(initialMessages);
  const [hasMoreMessages, setHasMoreMessages] = useState(initialHasMore);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [displayedCount, setDisplayedCount] = useState(initialMessages.length);

  const isLoadingMoreRef = useRef(false);
  const liveMessagesRef = useRef<Message[]>(initialMessages);
  const lastMessageTimestampRef = useRef<string>(
    initialMessages.length > 0
      ? new Date(initialMessages[initialMessages.length - 1].createdAt).toISOString()
      : new Date().toISOString()
  );

  useEffect(() => {
    liveMessagesRef.current = liveMessages;
  }, [liveMessages]);

  const loadMoreMessages = useCallback(async () => {
    if (!hasMoreMessages || !nextCursor || isLoadingMoreRef.current) return;

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const result = await loadThreadMessages({ threadId, cursor: nextCursor });

      if (result.ok && result.data) {
        const { messages: olderMessages, hasMore, nextCursor: newCursor } = result.data;

        const mappedMessages: Message[] = olderMessages.map((m) =>
          toClientMessage(m, { id: threadId, name: title, slug })
        );

        setLiveMessages((prev) => [...mappedMessages, ...prev]);
        setHasMoreMessages(hasMore);
        setNextCursor(newCursor);
        setDisplayedCount((prev) => prev + mappedMessages.length);
      } else {
        toasts.serverError();
      }
    } catch (error) {
      console.error('[thread-live] Failed to load more messages:', error);
      toasts.serverError();
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [hasMoreMessages, nextCursor, threadId, title, slug]);

  const mapBackfillMessage = useCallback(
    (m: ThreadMessage): Message => toClientMessage(m, { id: threadId, name: title, slug }),
    [threadId, title, slug]
  );

  const mergeBackfill = useCallback(
    (newMessages: Message[]) => {
      let hasNew = false;
      setLiveMessages((prev) => {
        const { merged, hasNew: foundNew } = mergeMessages(prev, newMessages);
        hasNew = foundNew;
        if (foundNew) {
          lastMessageTimestampRef.current = new Date(merged[merged.length - 1].createdAt).toISOString();
        }
        return merged;
      });
      return hasNew;
    },
    []
  );

  const addMessage = useCallback((msg: Message) => {
    setLiveMessages((prev) => {
      const cleaned = prev.filter(
        (m) => !ownPendingIds.current.has(m.id) || m.id === msg.id
      );
      const idx = cleaned.findIndex((m) => m.id === msg.id);
      if (idx !== -1) {
        const updated = [...cleaned];
        updated[idx] = msg;
        return updated;
      }
      return [...cleaned, msg];
    });
    const msgTimestamp = new Date(msg.createdAt).toISOString();
    if (msgTimestamp > lastMessageTimestampRef.current) {
      lastMessageTimestampRef.current = msgTimestamp;
    }
  }, []);

  const ownPendingIds = useRef<Set<string>>(new Set());

  const addOptimistic = useCallback((optimisticMsg: Message) => {
    ownPendingIds.current.add(optimisticMsg.id);
    setLiveMessages((prev) => [...prev, optimisticMsg]);
  }, []);

  const removeOptimistic = useCallback((tempId: string) => {
    setLiveMessages((prev) => prev.filter((m) => m.id !== tempId));
    ownPendingIds.current.delete(tempId);
  }, []);

  const updateMessageContent = useCallback((messageId: string, content: string) => {
    setLiveMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content } : m))
    );
  }, []);

  return {
    liveMessages,
    liveMessagesRef,
    lastMessageTimestampRef,
    hasMoreMessages,
    nextCursor,
    isLoadingMore,
    displayedCount,
    totalMessageCount,
    loadMoreMessages,
    mapBackfillMessage,
    mergeBackfill,
    addMessage,
    addOptimistic,
    removeOptimistic,
    updateMessageContent,
  };
}

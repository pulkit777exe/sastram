'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadThreadMessages } from '@/modules/threads/actions';
import { toClientMessage, type ThreadMessage } from '@/modules/threads/service';
import { toasts } from '@/lib/utils/toast';
import { clientLogger } from '@/lib/utils/client-logger';
import type { Message } from '@/lib/types/index';

function buildIdIndex(messages: Message[]): Map<string, number> {
  return new Map(messages.map((m, i) => [m.id, i]));
}

function sortByCreatedAt(messages: Message[]): Message[] {
  return [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

function deletedAtTime(value: Date | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function dateTime(value: Date | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function attachmentsEqual(a: Message['attachments'], b: Message['attachments']): boolean {
  if (a === b) return true;
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) {
    if (aa[i]?.id !== bb[i]?.id || aa[i]?.url !== bb[i]?.url) return false;
  }
  return true;
}

function buildMessagePatch(existing: Message, incoming: Message): Partial<Message> | null {
  const patch: Partial<Message> = {};
  let changed = false;
  if (existing.content !== incoming.content) {
    patch.content = incoming.content;
    changed = true;
  }
  if (existing.isPinned !== incoming.isPinned) {
    patch.isPinned = incoming.isPinned;
    changed = true;
  }
  if (deletedAtTime(existing.deletedAt) !== deletedAtTime(incoming.deletedAt)) {
    patch.deletedAt = incoming.deletedAt;
    changed = true;
  }
  if (existing.likeCount !== incoming.likeCount) {
    patch.likeCount = incoming.likeCount;
    changed = true;
  }
  if (existing.replyCount !== incoming.replyCount) {
    patch.replyCount = incoming.replyCount;
    changed = true;
  }
  if (existing.isEdited !== incoming.isEdited) {
    patch.isEdited = incoming.isEdited;
    changed = true;
  }
  if (dateTime(existing.updatedAt) !== dateTime(incoming.updatedAt)) {
    patch.updatedAt = incoming.updatedAt;
    changed = true;
  }
  if (existing.factCheckStatus !== incoming.factCheckStatus) {
    patch.factCheckStatus = incoming.factCheckStatus;
    changed = true;
  }
  if (existing.truncated !== incoming.truncated) {
    patch.truncated = incoming.truncated;
    changed = true;
  }
  if (!attachmentsEqual(existing.attachments, incoming.attachments)) {
    patch.attachments = incoming.attachments;
    changed = true;
  }
  return changed ? patch : null;
}

export function applyMessagePatchToList(
  prev: Message[],
  messageId: string,
  patch: Partial<Message>
): Message[] {
  const idx = prev.findIndex((m) => m.id === messageId);
  if (idx === -1) return prev;
  const next = [...prev];
  next[idx] = { ...next[idx], ...patch } as Message;
  return next;
}

export function mergeMessages(prev: Message[], incoming: Message[]): { merged: Message[]; hasNew: boolean } {
  const idToIndex = buildIdIndex(prev);
  let next = prev;
  let hasContentUpdate = false;

  for (const msg of incoming) {
    const existingIndex = idToIndex.get(msg.id);
    const isExistingMessage = existingIndex !== undefined;
    if (!isExistingMessage) {
      continue;
    }

    const patch = buildMessagePatch(next[existingIndex as number], msg);
    if (patch) {
      const isFirstMutation = next === prev;
      if (isFirstMutation) {
        next = [...prev];
      }
      next[existingIndex as number] = { ...next[existingIndex as number], ...patch };
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
  // Count of messages loaded via pagination/history (initial + "load older"). Not bumped by live arrivals.
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

        setLiveMessages((prev) => sortByCreatedAt([...mappedMessages, ...prev]));
        setHasMoreMessages(hasMore);
        setNextCursor(newCursor);
        setDisplayedCount((prev) => prev + mappedMessages.length);
      } else {
        toasts.serverError();
      }
    } catch (error) {
      clientLogger.error('thread-live', 'Failed to load more messages:', error as Error);
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

  const applyMessagePatch = useCallback((messageId: string, patch: Partial<Message>) => {
    setLiveMessages((prev) => applyMessagePatchToList(prev, messageId, patch));
  }, []);

  const addMessage = useCallback((msg: Message, opts?: { optimisticId?: string }) => {
    setLiveMessages((prev) => {
      const optimisticId = opts?.optimisticId;
      // Only remove a specific optimistic when its id is known. Without it, keep all
      // pending optimistics to avoid wiping unrelated in-flight sends on server echoes.
      const cleaned = optimisticId ? prev.filter((m) => m.id !== optimisticId) : prev;
      const idx = cleaned.findIndex((m) => m.id === msg.id);
      if (idx !== -1) {
        // Route through the shared patch path so rendered fields stay consistent
        // with backfill merges instead of diverging.
        const existing = cleaned[idx] as Message;
        const patch = buildMessagePatch(existing, msg);
        if (patch) {
          return applyMessagePatchToList(cleaned, msg.id, patch);
        }
        // No patch-field drift — still reconcile if any other field changed.
        if (JSON.stringify(existing) === JSON.stringify(msg)) return cleaned;
        return applyMessagePatchToList(cleaned, msg.id, { ...msg });
      }
      return [...cleaned, msg];
    });
    if (opts?.optimisticId) {
      ownPendingIds.current.delete(opts.optimisticId);
    } else if (ownPendingIds.current.has(msg.id)) {
      ownPendingIds.current.delete(msg.id);
    }
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
    applyMessagePatch,
  };
}

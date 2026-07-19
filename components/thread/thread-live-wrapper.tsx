'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommentTree } from '@/components/thread/comment-tree';
import { PostMessageForm } from '@/components/chat/post-message-form';
import { useThreadWebSocket } from '@/hooks/useThreadWebSocket';
import type { Message } from '@/lib/types/index';
import { PollPanel } from '@/components/thread/poll-panel';
import { markThreadReadAction } from '@/modules/read-receipts/actions';
import { loadThreadMessages, backfillThreadMessages } from '@/modules/threads/actions';
import { getPollResultsAction, getPollByThreadAction } from '@/modules/polls/actions';
import type { PollResults } from '@/modules/polls/types';
import { toasts } from '@/lib/utils/toast';
import { InlinePoll } from '@/components/thread/inline-poll';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { ThreadPageHeader } from './thread-page-header';
import { ChevronDown, Loader2, Pin } from 'lucide-react';

interface ThreadLiveWrapperProps {
  messages: Message[];
  threadId: string;
  initialUnreadCount: number;
  initialFirstUnreadMessageId: string | null;
  hasMoreMessages: boolean;
  nextCursor: string | null;
  totalMessageCount: number;
  poll: {
    id: string;
    question: string;
    options: string[];
    isActive: boolean;
    expiresAt: Date | null;
  } | null;
  canManagePoll: boolean;
  currentUser: {
    id: string;
    name: string;
    image: string | null;
    role?: string;
  };
  title: string;
  slug: string;
  initialFrequency: 'DAILY' | 'WEEKLY' | 'NEVER' | null;
}

export function ThreadLiveWrapper({
  messages,
  threadId,
  initialUnreadCount,
  initialFirstUnreadMessageId,
  hasMoreMessages: initialHasMore,
  nextCursor: initialNextCursor,
  totalMessageCount,
  poll,
  canManagePoll,
  currentUser,
  title,
  slug,
  initialFrequency,
}: ThreadLiveWrapperProps) {
  const [liveMessages, setLiveMessages] = useState<Message[]>(messages);
  const [aiInlineStatus, setAiInlineStatus] = useState<Record<string, 'pending' | 'failed'>>({});
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState(initialFirstUnreadMessageId);
  const [showPoll, setShowPoll] = useState(false);
  const [currentPoll, setCurrentPoll] = useState(poll);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(initialHasMore);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [displayedCount, setDisplayedCount] = useState(messages.length);
  const [pollResults, setPollResults] = useState<PollResults | null>(null);
  const [pollRefreshKey, setPollRefreshKey] = useState(0);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const readDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMarkingReadRef = useRef(false);
  const ownPendingIds = useRef<Set<string>>(new Set());
  const aiInlineTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const isLoadingMoreRef = useRef(false);
  const currentPollRef = useRef(currentPoll);
  useEffect(() => {
    currentPollRef.current = currentPoll;
  });
  const lastMessageTimestampRef = useRef<string>(
    messages.length > 0 ? new Date(messages[messages.length - 1].createdAt).toISOString() : new Date().toISOString()
  );

  const loadMoreMessages = useCallback(async () => {
    if (!hasMoreMessages || !nextCursor || isLoadingMoreRef.current) return;

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const result = await loadThreadMessages(threadId, nextCursor);

      if (result.ok && result.data) {
        const { messages: olderMessages, hasMore, nextCursor: newCursor } = result.data;

        const mappedMessages: Message[] = olderMessages.map((m: any) => ({
          id: m.id,
          content: m.body ?? m.content ?? '',
          createdAt: m.createdAt,
          senderId: m.senderId,
          parentId: m.parentId ?? null,
          threadId,
          depth: m.depth ?? 0,
          isEdited: m.isEdited ?? false,
          isPinned: m.isPinned ?? false,
          likeCount: m.likeCount ?? 0,
          replyCount: m.replyCount ?? 0,
          isAiResponse: m.isAI ?? m.isAiResponse ?? false,
          updatedAt: m.createdAt,
          deletedAt: m.deletedAt ?? null,
          sender: {
            id: m.author?.id ?? m.senderId,
            name: m.author?.name ?? 'Anonymous',
            image: m.author?.image ?? null,
          },
          attachments: (m.attachments ?? []).map((att: any) => ({
            id: att.id,
            name: att.name ?? null,
            url: att.url,
            type: att.type,
            size: att.size ?? null,
          })),
          thread: {
            id: threadId,
            name: title,
            slug,
          },
        }));

        setLiveMessages((prev) => [...mappedMessages, ...prev]);
        setHasMoreMessages(hasMore);
        setNextCursor(newCursor);
        setDisplayedCount((prev) => prev + mappedMessages.length);
      } else {
        toasts.serverError();
      }
    } catch (error) {
      toasts.serverError();
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [hasMoreMessages, nextCursor, threadId, title, slug]);

  const liveMessagesRef = useRef<Message[]>(messages);
  useEffect(() => {
    liveMessagesRef.current = liveMessages;
  }, [liveMessages]);

  const unreadCountRef = useRef(initialUnreadCount);
  useEffect(() => {
    unreadCountRef.current = unreadCount;
  }, [unreadCount]);

  const pinnedMessage = useMemo(() => liveMessages.find((m) => m.isPinned) ?? null, [liveMessages]);

  const hasAiMention = useCallback((content: string) => /\B@sai\b/i.test(content), []);

  const mapBackfillMessage = useCallback(
    (m: any): Message => ({
      id: m.id,
      content: m.body ?? m.content ?? '',
      createdAt: m.createdAt,
      senderId: m.senderId,
      parentId: m.parentId ?? null,
      threadId,
      depth: m.depth ?? 0,
      isEdited: m.isEdited ?? false,
      isPinned: m.isPinned ?? false,
      likeCount: m.likeCount ?? 0,
      replyCount: m.replyCount ?? 0,
      isAiResponse: m.isAI ?? m.isAiResponse ?? false,
      updatedAt: m.createdAt,
      deletedAt: m.deletedAt ?? null,
      sender: {
        id: m.sender?.id ?? m.senderId,
        name: m.sender?.name ?? 'Anonymous',
        image: m.sender?.image ?? null,
      },
      attachments: (m.attachments ?? []).map((att: any) => ({
        id: att.id,
        name: att.name ?? null,
        url: att.url,
        type: att.type,
        size: att.size ?? null,
      })),
      thread: { id: threadId, name: title, slug },
    }),
    [threadId, title, slug]
  );

  const isAtBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
  }, []);

  const setAiPending = useCallback((messageId: string) => {
    setAiInlineStatus((prev) => ({ ...prev, [messageId]: 'pending' }));
    const existing = aiInlineTimerRef.current.get(messageId);
    if (existing) clearTimeout(existing);
    // 2 minute timeout to allow for worker cold starts
    const timer = setTimeout(() => {
      setAiInlineStatus((prev) => {
        if (prev[messageId] !== 'pending') return prev;
        return { ...prev, [messageId]: 'failed' };
      });
      aiInlineTimerRef.current.delete(messageId);
    }, 120_000);
    aiInlineTimerRef.current.set(messageId, timer);
  }, []);

  const clearAiStatus = useCallback((messageId: string) => {
    setAiInlineStatus((prev) => {
      if (!(messageId in prev)) return prev;
      const next = { ...prev };
      delete next[messageId];
      return next;
    });
    const timer = aiInlineTimerRef.current.get(messageId);
    if (timer) {
      clearTimeout(timer);
      aiInlineTimerRef.current.delete(messageId);
    }
  }, []);

  const markThreadAsRead = useCallback(
    async (force: boolean = false) => {
      if (unreadCountRef.current <= 0) return;
      if (isMarkingReadRef.current) return;
      if (!force && !isAtBottom()) return;

      const latestId = liveMessagesRef.current[liveMessagesRef.current.length - 1]?.id ?? null;

      isMarkingReadRef.current = true;
      const result = await markThreadReadAction(threadId, latestId);
      isMarkingReadRef.current = false;

      // Best-effort: a failed read-receipt must not surface a scary, repeating
      // error toast to the user (the action logs server-side). Treat as done so
      // it is not retried.
      if (result.error) return;

      setUnreadCount(0);
      setFirstUnreadMessageId(null);
    },
    [isAtBottom, threadId]
  );

  const handleWsNewMessage = useCallback(
    (newMessage: Message) => {
      const wasAtBottom = isAtBottom();

      const msgTimestamp = new Date(newMessage.createdAt).toISOString();
      if (msgTimestamp > lastMessageTimestampRef.current) {
        lastMessageTimestampRef.current = msgTimestamp;
      }

      setLiveMessages((prev) => {
        // Own message already added via handleMessagePosted
        if (ownPendingIds.current.has(newMessage.id)) {
          ownPendingIds.current.delete(newMessage.id);
          const idx = prev.findIndex((m) => m.id === newMessage.id);
          if (idx === -1) return prev;
          const merged = { ...prev[idx], ...newMessage };
          if (merged === prev[idx]) return prev;
          const next = [...prev];
          next[idx] = merged;
          return next;
        }

        // Streaming content update (same ID, new content from AI)
        const existingIndex = prev.findIndex((m) => m.id === newMessage.id);
        if (existingIndex !== -1) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            content: newMessage.content,
          };
          return updated;
        }

        // Genuinely new message — schedule unread update OUTSIDE updater
        // via microtask to avoid setState-in-setState React violation
        if (!wasAtBottom) {
          Promise.resolve().then(() => {
            setUnreadCount((c) => c + 1);
            setFirstUnreadMessageId((id) => id ?? newMessage.id);
          });
        }

        return [...prev, newMessage];
      });
    },
    [isAtBottom]
  );

  // Called by WebSocket hook when isComplete:true arrives on an AI message
  const handleAiComplete = useCallback(
    (parentMessageId: string) => {
      clearAiStatus(parentMessageId);
    },
    [clearAiStatus]
  );

  const handleWsMessageDeleted = useCallback((messageId: string) => {
    setLiveMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, deletedAt: new Date() } : m))
    );
  }, []);

  const handleWsPinUpdate = useCallback((messageId: string, isPinned: boolean) => {
    setLiveMessages((prev) =>
      prev.map((m) => ({
        ...m,
        isPinned: m.id === messageId ? isPinned : isPinned ? false : m.isPinned,
      }))
    );
  }, []);

  const handleWsMessageEdited = useCallback((messageId: string, content: string) => {
    setLiveMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, content, isEdited: true, updatedAt: new Date() } : m
      )
    );
  }, []);

  const handleReactionUpdate = useCallback(
    (update: { messageId: string; reactionType: string; count: number }) => {
      setLiveMessages((prev) =>
        prev.map((m) =>
          m.id === update.messageId ? { ...m, likeCount: update.count } : m
        )
      );
    },
    []
  );

  const handleReconnect = useCallback(async () => {
    const since = lastMessageTimestampRef.current;
    try {
      const result = await backfillThreadMessages(threadId, since);
      if (result?.ok && result.data?.messages) {
        const newMessages = result.data.messages;
        if (newMessages.length === 0) return;

        setLiveMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const toAdd = newMessages
            .filter((m: any) => !existingIds.has(m.id))
            .map((m: any) => ({
              id: m.id,
              content: m.body ?? m.content ?? '',
              createdAt: m.createdAt,
              senderId: m.senderId,
              parentId: m.parentId ?? null,
              threadId,
              depth: m.depth ?? 0,
              isEdited: m.isEdited ?? false,
              isPinned: m.isPinned ?? false,
              likeCount: m.likeCount ?? 0,
              replyCount: m.replyCount ?? 0,
              isAiResponse: m.isAI ?? m.isAiResponse ?? false,
              updatedAt: m.createdAt,
              deletedAt: m.deletedAt ?? null,
              truncated: false,
              sender: {
                id: m.sender?.id ?? m.senderId,
                name: m.sender?.name ?? 'Anonymous',
                image: m.sender?.image ?? null,
              },
              attachments: (m.attachments ?? []).map((att: any) => ({
                id: att.id,
                name: att.name ?? null,
                url: att.url,
                type: att.type,
                size: att.size ?? null,
              })),
              thread: { id: threadId, name: title, slug },
            }));

          if (toAdd.length === 0) return prev;

          const merged = [...prev, ...toAdd].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          lastMessageTimestampRef.current = new Date(
            merged[merged.length - 1].createdAt
          ).toISOString();
          return merged;
        });
      }
    } catch {
      // Silent — backfill is best-effort
    }
  }, [threadId, title, slug]);

  useThreadWebSocket({
    threadId,
    currentUserId: currentUser.id,
    onNewMessage: handleWsNewMessage,
    onMessageDeleted: handleWsMessageDeleted,
    onMessageEdited: handleWsMessageEdited,
    onPinUpdate: handleWsPinUpdate,
    onAiComplete: handleAiComplete,
    onReconnect: handleReconnect,
    onReactionUpdate: handleReactionUpdate,
  });

  const handleMessagePosted = useCallback(
    (newMessage: Message) => {
      ownPendingIds.current.add(newMessage.id);
      setLiveMessages((prev) => {
        // Remove any pending optimistic message (temp ID) for this sender+parent
        const cleaned = prev.filter(
          (m) => !ownPendingIds.current.has(m.id) || m.id === newMessage.id
        );
        // Replace if already exists
        const idx = cleaned.findIndex((m) => m.id === newMessage.id);
        if (idx !== -1) {
          const updated = [...cleaned];
          updated[idx] = newMessage;
          return updated;
        }
        return [...cleaned, newMessage];
      });
      if (hasAiMention(newMessage.content)) {
        setAiPending(newMessage.id);
      }
    },
    [hasAiMention, setAiPending]
  );

  const handleOptimisticMessage = useCallback(
    (optimisticMsg: Message) => {
      ownPendingIds.current.add(optimisticMsg.id);
      setLiveMessages((prev) => [...prev, optimisticMsg]);
    },
    []
  );

  const handleMessageError = useCallback((tempId: string) => {
    setLiveMessages((prev) => prev.filter((m) => m.id !== tempId));
    ownPendingIds.current.delete(tempId);
  }, []);

  const scrollToFirstUnread = useCallback(() => {
    if (firstUnreadMessageId) {
      document
        .getElementById(`message-${firstUnreadMessageId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [firstUnreadMessageId]);

  useEffect(() => {
    if (unreadCount <= 0) return;
    const timer = setTimeout(() => {
      void markThreadAsRead(true);
    }, 30_000);
    return () => clearTimeout(timer);
  }, [unreadCount, markThreadAsRead]);

  useEffect(() => {
    const timers = aiInlineTimerRef.current;
    return () => {
      if (readDebounceRef.current) clearTimeout(readDebounceRef.current);
      if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  // Poll for new messages (AI responses, other users' messages) since WebSocket is not connected.
  // Adaptive: pauses when tab hidden, backs off when quiet, resets on new messages.
  useEffect(() => {
    const BASE_INTERVAL = 20_000;
    const MAX_INTERVAL = 60_000;
    const BACKOFF_MULTIPLIER = 2;
    const BACKOFF_THRESHOLD = 3; // consecutive empty polls before backing off

    let currentInterval = BASE_INTERVAL;
    let emptyPollCount = 0;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      try {
        const since = lastMessageTimestampRef.current;
        const result = await backfillThreadMessages(threadId, since);

        // Piggyback poll vote refresh on every message poll tick
        if (currentPollRef.current) {
          try {
            const pollId = currentPollRef.current.id;
            const [freshPollResult, freshResultsResult] = await Promise.all([
              getPollByThreadAction(threadId),
              getPollResultsAction(pollId),
            ]);
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
            // Poll refresh is best-effort — don't block message polling
          }
        }

        if (!result?.ok || !result.data?.messages?.length) {
          emptyPollCount++;
          if (emptyPollCount >= BACKOFF_THRESHOLD) {
            currentInterval = Math.min(currentInterval * BACKOFF_MULTIPLIER, MAX_INTERVAL);
          }
          return;
        }

        const newMessages: Message[] = result.data.messages.map((m: any) =>
          mapBackfillMessage(m)
        );

        let hasNew = false;
        setLiveMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const toAdd = newMessages.filter((m) => !existingIds.has(m.id));
          if (toAdd.length === 0) return prev;
          hasNew = true;
          const merged = [...prev, ...toAdd].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          lastMessageTimestampRef.current = new Date(
            merged[merged.length - 1].createdAt
          ).toISOString();
          return merged;
        });

        if (hasNew) {
          // Reset backoff on new message
          emptyPollCount = 0;
          currentInterval = BASE_INTERVAL;
          // Defer status clears to avoid state updates during render
          for (const msg of newMessages) {
            if (msg.isAiResponse && msg.parentId) {
              setTimeout(() => clearAiStatus(msg.parentId!), 0);
            }
          }
        } else {
          emptyPollCount++;
          if (emptyPollCount >= BACKOFF_THRESHOLD) {
            currentInterval = Math.min(currentInterval * BACKOFF_MULTIPLIER, MAX_INTERVAL);
          }
        }
      } catch {
        // Silent — poll is best-effort
      }
    }

    function startTimer() {
      if (timer) clearInterval(timer);
      timer = setInterval(poll, currentInterval);
    }

    // Page Visibility API: pause when hidden, immediate poll + resume on visible
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        poll(); // immediate poll on foreground
        startTimer(); // restart with current interval
      } else {
        if (timer) clearInterval(timer);
        timer = null;
      }
    }

    // Start initial poll and timer
    poll();
    startTimer();

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [threadId, title, slug, mapBackfillMessage, clearAiStatus]);

  // Fast poll while an @sai reply is generating. The WebSocket runs in noop mode
  // in dev, so real-time delivery is dropped and the 20s poll would make inline
  // AI replies feel like they never arrived. Poll every 3s while any AI status is
  // pending so the reply (or its quota message) surfaces promptly.
  useEffect(() => {
    const hasPending = Object.values(aiInlineStatus).includes('pending');
    if (!hasPending) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const fastPoll = async () => {
      try {
        const result = await backfillThreadMessages(threadId, lastMessageTimestampRef.current);
        if (!result?.ok || !result.data?.messages?.length) return;
        const incoming = result.data.messages.map((m: any) => mapBackfillMessage(m));
        setLiveMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const toAdd = incoming.filter((m) => !existingIds.has(m.id));
          if (toAdd.length === 0) return prev;
          const merged = [...prev, ...toAdd].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          lastMessageTimestampRef.current = new Date(
            merged[merged.length - 1].createdAt
          ).toISOString();
          return merged;
        });
        for (const msg of incoming) {
          if (msg.isAiResponse && msg.parentId) {
            setTimeout(() => clearAiStatus(msg.parentId!), 0);
          }
        }
      } catch {
        // best-effort
      }
    };

    fastPoll();
    timer = setInterval(fastPoll, 3000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [aiInlineStatus, threadId, mapBackfillMessage, clearAiStatus]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Fixed header */}
      <ThreadPageHeader
        title={title}
        threadId={threadId}
        slug={slug}
        initialFrequency={initialFrequency}
      />

      {/* Fixed pinned message banner just below header */}
      {pinnedMessage && (
        <div className="border-b border-amber-100 bg-amber-50/60 px-6 py-2.5 flex-shrink-0 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-start gap-2">
              <Pin size={13} className="text-amber-600 mt-0.5 shrink-0" />
              <div className="min-w-0">
              <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">
                Pinned Message
              </p>
              <p className="mt-0.5 truncate text-xs text-amber-900/90 font-medium">
                {pinnedMessage.content}
              </p>
              </div>
            </div>
            <button
              type="button"
              className="shrink-0 text-xs font-semibold text-brand hover:text-brand underline"
              onClick={() =>
                document
                  .getElementById(`message-${pinnedMessage.id}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }
            >
              Jump to message
            </button>
          </div>
        </div>
      )}

      {/* Scrollable messages — flex-1 */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-6 py-4"
        role="log"
        aria-live="polite"
        aria-label="Thread messages"
        onScroll={() => {
          if (readDebounceRef.current) clearTimeout(readDebounceRef.current);
          readDebounceRef.current = setTimeout(() => {
            void markThreadAsRead(false);
          }, 250);
          if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
          scrollDebounceRef.current = setTimeout(() => {
            const el = scrollContainerRef.current;
            if (el) {
              setIsScrolledUp(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
            }
          }, 100);
        }}
      >
        <div className="max-w-4xl mx-auto">
          <div className="mb-4">
            <InlinePoll
              threadId={threadId}
              canManagePoll={canManagePoll}
              isOpen={showPoll}
              onToggle={setShowPoll}
              onPollCreated={(newPoll) => {
                setCurrentPoll(newPoll);
              }}
            />
          </div>
          {currentPoll && (
            <div className="mb-4">
              <PollPanel
                threadId={threadId}
                initialPoll={currentPoll}
                canManagePoll={canManagePoll}
                pollResults={pollResults}
                pollRefreshKey={pollRefreshKey}
              />
            </div>
          )}
        </div>

        <div className="max-w-4xl mx-auto">
          {liveMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center select-none">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5 bg-brand/10 border border-brand/15 dark:bg-brand/20 dark:border-brand/30 shadow-linear-sm">
                <svg className="w-8 h-8 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-3.037-.476 4.5 4.5 0 01-5.014-4.986L3 20.25l3.5-1.75A8.956 8.956 0 013 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
              </div>
              <h3 className="text-foreground font-semibold text-base mb-1.5">No messages yet</h3>
              <p className="text-muted-foreground/70 text-sm max-w-[260px] leading-relaxed">
                Be the first to share something — ask a question, share a thought, or just say hi!
              </p>
            </div>
          ) : (
            <ErrorBoundary>
              {hasMoreMessages && (
                <div className="mb-4 flex justify-center">
                  <button
                    type="button"
                    onClick={loadMoreMessages}
                    disabled={isLoadingMore}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        Load older messages ({totalMessageCount - displayedCount} remaining)
                      </>
                    )}
                  </button>
                </div>
              )}
              <CommentTree
                messages={liveMessages}
                threadId={threadId}
                currentUser={currentUser}
                aiInlineStatus={aiInlineStatus}
                onOptimisticMessage={handleOptimisticMessage}
                firstUnreadMessageId={firstUnreadMessageId}
                scrollContainerRef={scrollContainerRef}
              />
            </ErrorBoundary>
          )}
        </div>
      </div>

      {/* Scroll-to-bottom floating button */}
      {isScrolledUp && (
        <div className="absolute bottom-[130px] right-6 z-30 flex flex-col items-center gap-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <button
            type="button"
            onClick={() => {
              scrollContainerRef.current?.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' });
              void markThreadAsRead(true);
            }}
            className="relative w-9 h-9 rounded-full bg-brand hover:bg-brand/90 text-white shadow-linear-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95"
            title="Scroll to bottom"
          >
            {unreadCount > 0 && (
              <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] rounded-full bg-brand text-white text-[9px] font-bold flex items-center justify-center px-1 border-2 border-background">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
            <ChevronDown size={16} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* Composer container */}
      <div className="p-4 bg-background border-t border-border/60 flex-shrink-0">
        <div className="max-w-4xl mx-auto">
          <PostMessageForm
            threadId={threadId}
            currentUser={currentUser}
            onMessagePosted={handleMessagePosted}
            onOptimisticMessage={handleOptimisticMessage}
            onMessageError={handleMessageError}
            canManagePoll={canManagePoll}
            showPoll={showPoll}
            onTogglePoll={setShowPoll}
            onPollCreated={(newPoll) => {
              setCurrentPoll({
                id: newPoll.id,
                question: newPoll.question,
                options: newPoll.options,
                isActive: newPoll.isActive,
                expiresAt: newPoll.expiresAt,
              });
            }}
          />
        </div>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommentTree } from '@/components/thread/comment-tree';
import { PostMessageForm } from '@/components/chat/post-message-form';
import { useAIReplyStream, type AIStreamStart, type AIStreamError } from '@/hooks/useAIReplyStream';
import type { AiInlineMeta, Message } from '@/lib/types/index';
import { PollPanel } from '@/components/thread/poll-panel';
import { markThreadReadAction } from '@/modules/read-receipts/actions';
import { loadThreadMessages, backfillThreadMessages } from '@/modules/threads/actions';
import { toClientMessage, type ThreadMessage } from '@/modules/threads/service';
import { getPollResultsAction, getPollByThreadAction } from '@/modules/polls/actions';
import type { PollResults } from '@/modules/polls/types';
import { toasts } from '@/lib/utils/toast';
import { InlinePoll } from '@/components/thread/inline-poll';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { ThreadPageHeader } from './thread-page-header';
import { ChevronDown, Loader2, Pin } from 'lucide-react';

function mergeMessages(prev: Message[], incoming: Message[]): { merged: Message[]; hasNew: boolean } {
  const idToIdx = new Map(prev.map((m, i) => [m.id, i]));
  let next = prev;
  for (const msg of incoming) {
    const idx = idToIdx.get(msg.id);
    if (idx !== undefined && next[idx].content !== msg.content) {
      if (next === prev) next = [...prev];
      next[idx] = { ...next[idx], content: msg.content };
    }
  }
  const toAdd = incoming.filter((m) => !idToIdx.has(m.id));
  if (toAdd.length === 0 && next === prev) return { merged: prev, hasNew: false };
  const merged = [...next, ...toAdd].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  return { merged, hasNew: true };
}

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
    (m: ThreadMessage): Message => toClientMessage(m, { id: threadId, name: title, slug }),
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

  // --- Instant @sai reply via SSE streaming ---
  // Tokens are streamed straight into the message list; polling remains the
  // fallback path (queued jobs, other viewers, stream failures).
  const streamParentRef = useRef<string | null>(null);

  const handleStreamStart = useCallback(
    (info: AIStreamStart) => {
      const aiMsg: Message = {
        id: info.messageId,
        content: '',
        threadId,
        senderId: info.senderId,
        parentId: info.parentId,
        depth: info.depth,
        isEdited: false,
        isPinned: false,
        likeCount: 0,
        replyCount: 0,
        isAiResponse: true,
        createdAt: new Date(info.createdAt),
        updatedAt: new Date(info.createdAt),
        deletedAt: null,
        sender: {
          id: info.senderId,
          name: info.senderName ?? 'Sastram AI',
          image: info.senderImage,
        },
        thread: { id: threadId, name: title, slug },
        attachments: [],
      };
      setLiveMessages((prev) =>
        prev.some((m) => m.id === aiMsg.id) ? prev : [...prev, aiMsg]
      );
    },
    [threadId, title, slug]
  );

  const handleStreamUpdate = useCallback((messageId: string, content: string) => {
    setLiveMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content } : m))
    );
  }, []);

  const handleStreamDone = useCallback(() => {
    const parentId = streamParentRef.current;
    streamParentRef.current = null;
    if (parentId) clearAiStatus(parentId);
  }, [clearAiStatus]);

  const handleStreamError = useCallback(
    (_err: AIStreamError) => {
      const parentId = streamParentRef.current;
      streamParentRef.current = null;
      // Fall back to the background job path so the reply can still arrive via
      // polling. Only mark the mention as failed if the fallback can't be queued;
      // the 2-minute pending timeout remains the last-resort failure signal.
      fetch(`/api/threads/${threadId}/ai-reply`, { method: 'POST' })
        .then((res) => {
          if (!res.ok) throw new Error('fallback enqueue failed');
        })
        .catch((error) => {
          console.error('[thread-live] AI-reply fallback enqueue failed:', error);
          if (parentId) {
            setAiInlineStatus((prev) =>
              prev[parentId] === 'pending' ? { ...prev, [parentId]: 'failed' } : prev
            );
          }
        });
    },
    [threadId]
  );

  const { startStream, stopStream } = useAIReplyStream({
    threadId,
    onStart: handleStreamStart,
    onMessageUpdate: handleStreamUpdate,
    onDone: handleStreamDone,
    onError: handleStreamError,
  });

  const markThreadAsRead = useCallback(
    async (force: boolean = false) => {
      if (unreadCountRef.current <= 0) return;
      if (isMarkingReadRef.current) return;
      if (!force && !isAtBottom()) return;

      const latestId = liveMessagesRef.current[liveMessagesRef.current.length - 1]?.id ?? null;

      isMarkingReadRef.current = true;
      const result = await markThreadReadAction({ threadId, lastReadMessageId: latestId });
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

  const handleMessagePosted = useCallback(
    (newMessage: Message, meta?: AiInlineMeta) => {
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
      const msgTimestamp = new Date(newMessage.createdAt).toISOString();
      if (msgTimestamp > lastMessageTimestampRef.current) {
        lastMessageTimestampRef.current = msgTimestamp;
      }

      // Prefer the server's verdict (streaming/queued/limited/null) over the
      // local regex so quota-limited or query-less mentions don't hang in
      // "pending" forever.
      const aiInline =
        meta?.aiInline !== undefined
          ? meta.aiInline
          : hasAiMention(newMessage.content)
            ? 'queued'
            : null;

      if (aiInline === 'streaming') {
        setAiPending(newMessage.id);
        streamParentRef.current = newMessage.id;
        startStream(newMessage.id);
      } else if (aiInline === 'queued') {
        setAiPending(newMessage.id);
      }
    },
    [hasAiMention, setAiPending, startStream]
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
      stopStream();
    };
  }, [stopStream]);

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
        const result = await backfillThreadMessages({ threadId, since });

        // Piggyback poll vote refresh on every message poll tick
        if (currentPollRef.current) {
          try {
            const pollId = currentPollRef.current.id;
            const [freshPollResult, freshResultsResult] = await Promise.all([
              getPollByThreadAction({ threadId }),
              getPollResultsAction({ pollId }),
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

        const newMessages: Message[] = result.data.messages.map(mapBackfillMessage);

        let hasNew = false;
        setLiveMessages((prev) => {
          const { merged, hasNew: foundNew } = mergeMessages(prev, newMessages);
          hasNew = foundNew;
          if (foundNew) {
            lastMessageTimestampRef.current = new Date(merged[merged.length - 1].createdAt).toISOString();
          }
          return merged;
        });

        if (hasNew) {
          // Reset backoff on new message
          emptyPollCount = 0;
          currentInterval = BASE_INTERVAL;
          // Defer status clears to avoid state updates during render.
          // Only clear once the AI reply has actual content — the worker first
          // creates an EMPTY placeholder, and clearing on it would stop the
          // fast poll before the answer exists.
          for (const msg of newMessages) {
            if (msg.isAiResponse && msg.parentId && msg.content.trim().length > 0) {
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

  // Safety net: when a pending AI inline status has a corresponding AI response
  // message in liveMessages (regardless of how it arrived), clear the status.
  // Covers edge cases where polling misses the AI message (e.g., timestamp races).
  useEffect(() => {
    for (const [pendingMsgId, status] of Object.entries(aiInlineStatus)) {
      if (status !== 'pending') continue;
      if (
        liveMessages.some(
          (m) => m.parentId === pendingMsgId && m.isAiResponse && m.content.trim().length > 0
        )
      ) {
        setTimeout(() => clearAiStatus(pendingMsgId), 0);
      }
    }
  }, [liveMessages, aiInlineStatus, clearAiStatus]);

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
        const result = await backfillThreadMessages({ threadId, since: lastMessageTimestampRef.current });
        if (!result?.ok || !result.data?.messages?.length) return;
        const incoming = result.data.messages.map(mapBackfillMessage);
        setLiveMessages((prev) => {
          const { merged, hasNew } = mergeMessages(prev, incoming);
          if (hasNew) {
            lastMessageTimestampRef.current = new Date(merged[merged.length - 1].createdAt).toISOString();
          }
          return merged;
        });
        for (const msg of incoming) {
          // Empty placeholder = generation still running; keep fast-polling.
          if (msg.isAiResponse && msg.parentId && msg.content.trim().length > 0) {
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
        <div className="border-b border-chart-4/20 bg-chart-4/10 px-6 py-2.5 flex-shrink-0 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-start gap-2">
              <Pin size={13} className="text-chart-4 mt-0.5 shrink-0" />
              <div className="min-w-0">
              <p className="text-xs font-bold text-chart-4 uppercase tracking-wider">
                Pinned Message
              </p>
              <p className="mt-0.5 truncate text-xs text-chart-4/90 font-medium">
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
              <p className="text-muted-foreground/70 text-sm max-w-65 leading-relaxed">
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
                onMessagePosted={handleMessagePosted}
                firstUnreadMessageId={firstUnreadMessageId}
                scrollContainerRef={scrollContainerRef}
              />
            </ErrorBoundary>
          )}
        </div>
      </div>

      {/* Scroll-to-bottom floating button */}
      {isScrolledUp && (
        <div className="absolute bottom-32 right-6 z-30 flex flex-col items-center gap-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <button
            type="button"
            onClick={() => {
              scrollContainerRef.current?.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' });
              void markThreadAsRead(true);
            }}
            className="relative w-9 h-9 rounded-full bg-brand hover:bg-brand/90 text-primary-foreground shadow-linear-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95"
            title="Scroll to bottom"
          >
            {unreadCount > 0 && (
              <span className="absolute -top-2 -right-2 min-w-4.5 h-4.5 rounded-full bg-brand text-primary-foreground text-xs font-bold flex items-center justify-center px-1 border-2 border-background">
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
            aiClientStream
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

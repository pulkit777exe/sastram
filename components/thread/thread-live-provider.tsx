'use client';

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { Message } from '@/lib/types/index';
import type { PollResults } from '@/modules/polls/types';
import { useThreadMessages } from '@/hooks/thread/use-thread-messages';
import { useThreadPolling } from '@/hooks/thread/use-thread-polling';
import { useThreadReadReceipts } from '@/hooks/thread/use-thread-read-receipts';
import { useAIReplyStream, type AIStreamStart, type AIStreamError } from '@/hooks/useAIReplyStream';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Pin, Loader2, ChevronDown } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types — deep module interface (Vercel composition: explicit surface)
// ---------------------------------------------------------------------------

export type AiStatusVariant = 'pending' | 'failed';

export interface ThreadLiveState {
  messages: Message[];
  aiStatus: Record<string, AiStatusVariant>;
  hasMore: boolean;
  isLoadingMore: boolean;
  unreadCount: number;
  firstUnreadId: string | null;
  currentPoll: {
    id: string;
    question: string;
    options: string[];
    isActive: boolean;
    expiresAt: Date | null;
  } | null;
  pollResults: PollResults | null;
}

export interface ThreadLiveActions {
  addMessage: (msg: Message) => void;
  updateContent: (messageId: string, content: string) => void;
  setAiPending: (messageId: string) => void;
  clearAiStatus: (messageId: string) => void;
  loadMore: () => Promise<void>;
  markRead: (force?: boolean) => Promise<void>;
  postOptimistic: (msg: Message) => void;
  removeOptimistic: (tempId: string) => void;
}

export interface ThreadLiveMeta {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}

export interface ThreadLiveContextValue {
  state: ThreadLiveState;
  actions: ThreadLiveActions;
  meta: ThreadLiveMeta;
}

// NOTE: follows server-action envelope pattern — consumers read { ok, data, error, errorCode }
// and sse utils conventions — see lib/utils/sse.ts (parseSSE, drainToText, sseEvent, sseChunk).
// TODO: polling vs SSE adapter — swap useThreadPolling for SSE subscription when adapter lands.
export const ThreadLiveContext = createContext<ThreadLiveContextValue | null>(null);

/**
 * Deep accessor — uses React 19 `use()` for context unwrapping.
 * Throws if called outside provider (fail-fast, no silent null).
 */
export function useThreadLive(): ThreadLiveContextValue {
  const ctx = use(ThreadLiveContext);
  if (!ctx) {
    throw new Error('useThreadLive must be used within ThreadLiveProvider');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface ThreadLiveProviderProps {
  threadId: string;
  initialMessages: Message[];
  title: string;
  slug: string;
  hasMore: boolean;
  nextCursor: string | null;
  totalCount: number;
  initialPoll: ThreadLiveState['currentPoll'];
  currentUser: {
    id: string;
    name: string;
    image: string | null;
    role?: string;
  };
  initialUnread: {
    count: number;
    firstUnreadId: string | null;
  };
  children: ReactNode;
}

export function ThreadLiveProvider({
  threadId,
  initialMessages,
  title,
  slug,
  hasMore,
  nextCursor,
  totalCount,
  initialPoll,
  currentUser: _currentUser,
  initialUnread,
  children,
}: ThreadLiveProviderProps) {
  // _currentUser is retained in props for future thread-membership checks;
  // not yet exposed via state to keep deep interface minimal (see Vercel composition).
  void _currentUser;

  // ----- Poll state (local ownership, envelope-aware refresh) -----
  const [currentPoll, setCurrentPoll] = useState<ThreadLiveState['currentPoll']>(initialPoll);
  const [pollResults, setPollResults] = useState<PollResults | null>(null);
  void setCurrentPoll;
  void setPollResults;
  const currentPollRef = useRef(currentPoll);
  useEffect(() => {
    currentPollRef.current = currentPoll;
  }, [currentPoll]);

  // ----- AI inline status + 120s timer (spec: pending -> failed) -----
  const [aiStatus, setAiStatus] = useState<Record<string, AiStatusVariant>>({});
  const aiStatusRef = useRef(aiStatus);
  useEffect(() => {
    aiStatusRef.current = aiStatus;
  }, [aiStatus]);
  const aiInlineTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ----- Scroll refs + debounce -----
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const readDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ----- Sub-hooks (composition root) -----
  const threadMessages = useThreadMessages({
    initialMessages,
    threadId,
    title,
    slug,
    hasMoreMessages: hasMore,
    nextCursor,
    totalMessageCount: totalCount,
  });

  const isAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
  }, []);

  const readReceipts = useThreadReadReceipts({
    threadId,
    initialUnreadCount: initialUnread.count,
    initialFirstUnreadMessageId: initialUnread.firstUnreadId,
    liveMessagesRef: threadMessages.liveMessagesRef,
    isAtBottom,
  });

  // ----- AI inline helpers (120s pending -> failed) -----
  const setAiPending = useCallback((messageId: string) => {
    setAiStatus((prev) => ({ ...prev, [messageId]: 'pending' }));
    const existing = aiInlineTimerRef.current.get(messageId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      setAiStatus((prev) => {
        if (prev[messageId] !== 'pending') return prev;
        return { ...prev, [messageId]: 'failed' };
      });
      aiInlineTimerRef.current.delete(messageId);
    }, 120_000);
    aiInlineTimerRef.current.set(messageId, timer);
  }, []);

  const clearAiStatus = useCallback((messageId: string) => {
    setAiStatus((prev) => {
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

  // ----- AI stream (SSE) — adapter seam -----
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
      threadMessages.addMessage(aiMsg);
    },
    [threadId, title, slug, threadMessages]
  );

  const handleStreamUpdate = useCallback(
    (messageId: string, content: string) => {
      threadMessages.updateMessageContent(messageId, content);
    },
    [threadMessages]
  );

  const handleStreamDone = useCallback(() => {
    const parentId = streamParentRef.current;
    streamParentRef.current = null;
    if (parentId) clearAiStatus(parentId);
  }, [clearAiStatus]);

  const handleStreamError = useCallback(
    (_err: AIStreamError) => {
      const parentId = streamParentRef.current;
      streamParentRef.current = null;
      // TODO: SSE adapter — on stream error, fall back to polling enqueue.
      // Server-action envelope expected: { ok, data, error, errorCode }.
      // Use lib/utils/sse helpers (parseSSEError, drainToText) for error parsing.
      fetch(`/api/threads/${threadId}/ai-reply`, { method: 'POST' })
        .then((res) => {
          if (!res.ok) throw new Error('fallback enqueue failed');
        })
        .catch((error) => {
          console.error('[ThreadLiveProvider] AI-reply fallback enqueue failed:', error);
          if (parentId) {
            setAiStatus((prev) =>
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

  // TODO: polling vs SSE adapter — when SSE adapter lands, expose adapter flag
  // and gate useThreadPolling behind `!useSSE`. The deep interface stays stable.
  useThreadPolling({
    threadId,
    lastMessageTimestampRef: threadMessages.lastMessageTimestampRef,
    aiInlineStatusRef: aiStatusRef,
    liveMessagesRef: threadMessages.liveMessagesRef,
    mapBackfillMessage: threadMessages.mapBackfillMessage,
    mergeBackfill: threadMessages.mergeBackfill,
    onAiStatusCleared: clearAiStatus,
  });

  // ----- AI arrived check — clear pending when AI response lands -----
  useEffect(() => {
    for (const [pendingId, status] of Object.entries(aiStatus)) {
      if (status !== 'pending') continue;
      const hasResponse = threadMessages.liveMessages.some(
        (m) => m.parentId === pendingId && m.isAiResponse && m.content.trim().length > 0
      );
      if (hasResponse) {
        // defer to avoid setState during render
        setTimeout(() => clearAiStatus(pendingId), 0);
      }
    }
  }, [threadMessages.liveMessages, aiStatus, clearAiStatus]);

  // ----- Scroll debounce (250ms read, 100ms scroll) -----
  const handleScroll = useCallback(() => {
    if (readDebounceRef.current) clearTimeout(readDebounceRef.current);
    readDebounceRef.current = setTimeout(() => {
      void readReceipts.markThreadAsRead(false);
    }, 250);
    if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
    scrollDebounceRef.current = setTimeout(() => {
      // No-op: scroll position derived from isAtBottom; placeholder for
      // future scroll-linked state (e.g., show scroll-to-bottom FAB).
    }, 100);
  }, [readReceipts]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // ----- Load-more sentinel (IntersectionObserver) -----
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !threadMessages.hasMoreMessages) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void threadMessages.loadMoreMessages();
        }
      },
      { root, rootMargin: '200px 0px 0px 0px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- threadMessages fields stable; object identity unstable
  }, [threadMessages.hasMoreMessages, threadMessages.loadMoreMessages]);

  // ----- Poll refresh (20s) — envelope-aware stub -----
  useEffect(() => {
    if (!currentPoll) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (cancelled) return;
      try {
        // TODO: polling vs SSE adapter — replace with SSE poll-update events.
        // Keep server-action envelope: const res = await getPollByThreadAction({ threadId });
        // if (!res.ok || !res.data) return;
        // const resultsRes = await getPollResultsAction({ pollId: currentPoll.id });
        // if (!resultsRes.ok) return;
        // setCurrentPoll(prev => prev ? { ...prev, isActive: res.data.isActive, expiresAt: res.data.expiresAt } : prev);
        // setPollResults(resultsRes.data);
      } catch {
        // best-effort
      }
    }, 20_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentPoll, threadId]);

  // ----- Cleanup (timers + stream) -----
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

  // ----- Expose deep interface via useMemo (stable reference) -----
  const state: ThreadLiveState = useMemo(
    () => ({
      messages: threadMessages.liveMessages,
      aiStatus,
      hasMore: threadMessages.hasMoreMessages,
      isLoadingMore: threadMessages.isLoadingMore,
      unreadCount: readReceipts.unreadCount,
      firstUnreadId: readReceipts.firstUnreadMessageId,
      currentPoll,
      pollResults,
    }),
    [
      threadMessages.liveMessages,
      aiStatus,
      threadMessages.hasMoreMessages,
      threadMessages.isLoadingMore,
      readReceipts.unreadCount,
      readReceipts.firstUnreadMessageId,
      currentPoll,
      pollResults,
    ]
  );

  const actions: ThreadLiveActions = useMemo(
    () => ({
      addMessage: threadMessages.addMessage,
      updateContent: threadMessages.updateMessageContent,
      setAiPending,
      clearAiStatus,
      loadMore: threadMessages.loadMoreMessages,
      markRead: readReceipts.markThreadAsRead,
      postOptimistic: threadMessages.addOptimistic,
      removeOptimistic: threadMessages.removeOptimistic,
    }),
    [
      threadMessages.addMessage,
      threadMessages.updateMessageContent,
      setAiPending,
      clearAiStatus,
      threadMessages.loadMoreMessages,
      readReceipts.markThreadAsRead,
      threadMessages.addOptimistic,
      threadMessages.removeOptimistic,
    ]
  );

  const meta: ThreadLiveMeta = useMemo(
    () => ({
      scrollRef,
      sentinelRef,
    }),
    []
  );

  const value = useMemo(() => ({ state, actions, meta }), [state, actions, meta]);

  // TODO: SSE adapter — expose streaming trigger via actions when adapter lands:
  // const triggerAiStream = (parentId: string) => { setAiPending(parentId); streamParentRef.current = parentId; startStream(parentId); };
  // Keep startStream/stopStream internal until deep interface is finalized.
  void startStream;
  void streamParentRef;

  return <ThreadLiveContext.Provider value={value}>{children}</ThreadLiveContext.Provider>;
}

// ---------------------------------------------------------------------------
// Compound helpers — ThreadLive.*
// Each uses use(ThreadLiveContext) and renders shadcn primitives with SAI tokens.
// No boolean props — explicit variant unions only.
// ---------------------------------------------------------------------------

type FrameVariant = 'default' | 'inset';
interface ThreadLiveFrameProps {
  variant?: FrameVariant;
  className?: string;
  children: ReactNode;
}

function ThreadLiveFrame({ variant = 'default', className, children }: ThreadLiveFrameProps) {
  const ctx = use(ThreadLiveContext);
  if (!ctx) throw new Error('ThreadLive.Frame must be used within ThreadLiveProvider');
  return (
    <div
      className={cn(
        'flex flex-col h-full overflow-hidden rounded-card border border-line bg-surface shadow-card',
        variant === 'inset' ? 'bg-inset' : 'bg-surface',
        className
      )}
    >
      {children}
    </div>
  );
}

type ScrollAreaVariant = 'thread' | 'compact';
interface ThreadLiveScrollAreaProps {
  variant?: ScrollAreaVariant;
  className?: string;
  children: ReactNode;
}

function ThreadLiveScrollArea({ variant = 'thread', className, children }: ThreadLiveScrollAreaProps) {
  const ctx = use(ThreadLiveContext);
  if (!ctx) throw new Error('ThreadLive.ScrollArea must be used within ThreadLiveProvider');
  return (
    <div
      // eslint-disable-next-line react-hooks/refs -- passing stable RefObject via context to scroll container
      ref={ctx.meta.scrollRef}
      role="log"
      aria-live="polite"
      aria-label="Thread messages"
      className={cn(
        'flex-1 overflow-y-auto bg-canvas',
        variant === 'thread' ? 'px-6 py-4' : 'px-4 py-3',
        className
      )}
    >
      <div className="max-w-4xl mx-auto">{children}</div>
    </div>
  );
}

// Alternate primitive-backed variant (shadcn ScrollArea) — kept as reference for
// future swap. Not used by default to avoid double scroll containers.
function ThreadLiveScrollAreaPrimitive({
  variant = 'thread',
  className,
  children,
}: ThreadLiveScrollAreaProps) {
  const ctx = use(ThreadLiveContext);
  if (!ctx) throw new Error('ThreadLive.ScrollArea must be used within ThreadLiveProvider');
  return (
    <ScrollArea className={cn('flex-1 bg-canvas', variant === 'thread' ? 'px-6 py-4' : 'px-4 py-3', className)}>
      {/* eslint-disable-next-line react-hooks/refs -- passing stable RefObject via context */}
      <div ref={ctx.meta.scrollRef} className="max-w-4xl mx-auto">
        {children}
      </div>
      <ScrollBar orientation="vertical" />
    </ScrollArea>
  );
}
void ThreadLiveScrollAreaPrimitive;

type PinnedBannerVariant = 'pinned' | 'placeholder';
interface ThreadLivePinnedBannerProps {
  variant?: PinnedBannerVariant;
  className?: string;
}

function ThreadLivePinnedBanner({ variant = 'pinned', className }: ThreadLivePinnedBannerProps) {
  const ctx = use(ThreadLiveContext);
  if (!ctx) throw new Error('ThreadLive.PinnedBanner must be used within ThreadLiveProvider');
  const pinned = ctx.state.messages.find((m) => m.isPinned) ?? null;
  if (!pinned && variant === 'pinned') return null;
  if (variant === 'placeholder' && !pinned) {
    return (
      <div className={cn('shrink-0 px-6 pt-3', className)}>
        <Card className="rounded-card border border-line bg-surface shadow-card px-4 py-3">
          <p className="text-xs text-ink-3">No pinned message</p>
        </Card>
      </div>
    );
  }
  if (!pinned) return null;
  return (
    <div className={cn('shrink-0 px-6 pt-3', className)}>
      <div className="max-w-4xl mx-auto flex items-center gap-2 px-4 py-2 rounded-card border border-line bg-surface shadow-card animate-in fade-in slide-in-from-top-1 duration-150">
        <Pin size={13} className="text-ink-3 shrink-0" aria-hidden />
        <span className="min-w-0 truncate text-xs text-ink-2 font-medium">{pinned.content}</span>
        <button
          type="button"
          className="shrink-0 text-xs font-semibold text-sai-accent-ink hover:underline"
          onClick={() =>
            document.getElementById(`message-${pinned.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        >
          Jump
        </button>
      </div>
    </div>
  );
}

type LoadMoreVariant = 'default' | 'compact';
interface ThreadLiveLoadMoreProps {
  variant?: LoadMoreVariant;
  className?: string;
}

function ThreadLiveLoadMore({ variant = 'default', className }: ThreadLiveLoadMoreProps) {
  const ctx = use(ThreadLiveContext);
  if (!ctx) throw new Error('ThreadLive.LoadMore must be used within ThreadLiveProvider');
  const { hasMore, isLoadingMore } = ctx.state;
  const { loadMore } = ctx.actions;
  const { sentinelRef } = ctx.meta;

  if (!hasMore && variant === 'default') {
    return (
      <>
        <div ref={sentinelRef} aria-hidden className="h-px" />
      </>
    );
  }

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-px" />
      {hasMore ? (
        <div className={cn('mb-4 flex justify-center', variant === 'compact' ? 'mb-2' : 'mb-4', className)}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadMore()}
            disabled={isLoadingMore}
            className="rounded-control border-line bg-surface hover:bg-hover"
          >
            {isLoadingMore ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden />
                Loading...
              </>
            ) : (
              <>Load older messages</>
            )}
          </Button>
        </div>
      ) : null}
    </>
  );
}

type PollVariant = 'default' | 'compact';
interface ThreadLivePollProps {
  variant?: PollVariant;
  className?: string;
}

function ThreadLivePoll({ variant = 'default', className }: ThreadLivePollProps) {
  const ctx = use(ThreadLiveContext);
  if (!ctx) throw new Error('ThreadLive.Poll must be used within ThreadLiveProvider');
  const { currentPoll, pollResults } = ctx.state;
  if (!currentPoll) return null;
  return (
    <div className={cn('mb-4', variant === 'compact' ? 'mb-2' : 'mb-4', className)}>
      <Card className="rounded-card border border-line bg-surface shadow-card p-4">
        <h3 className="text-sm font-semibold text-ink">{currentPoll.question}</h3>
        <ul className="mt-3 space-y-2">
          {currentPoll.options.map((opt, idx) => {
            const result = pollResults?.results.find((r) => r.index === idx);
            return (
              <li
                key={`${idx}-${opt}`}
                className="flex items-center justify-between rounded-control border border-line bg-canvas px-3 py-2 text-sm"
              >
                <span className="text-ink-2">{opt}</span>
                {result ? (
                  <span className="text-xs font-medium text-ink-3">
                    {result.votes} · {result.percentage}%
                  </span>
                ) : (
                  <span className="text-xs text-ink-3">—</span>
                )}
              </li>
            );
          })}
        </ul>
        {!currentPoll.isActive ? (
          <p className="mt-2 text-xs text-ink-3">Poll closed</p>
        ) : currentPoll.expiresAt ? (
          <p className="mt-2 text-xs text-ink-3">Expires {currentPoll.expiresAt.toLocaleString()}</p>
        ) : null}
      </Card>
    </div>
  );
}

type ComposerVariant = 'default' | 'compact';
interface ThreadLiveComposerProps {
  variant?: ComposerVariant;
  className?: string;
  placeholder?: string;
}

function ThreadLiveComposer({ variant = 'default', className, placeholder = 'Write a reply…' }: ThreadLiveComposerProps) {
  const ctx = use(ThreadLiveContext);
  if (!ctx) throw new Error('ThreadLive.Composer must be used within ThreadLiveProvider');
  // TODO: wire to PostMessageForm + AI inline delivery (streaming vs queued).
  // Server-action envelope: postMessageAction → { ok, data, error, errorCode }
  // SSE path will stream via useAIReplyStream when @sai is mentioned.
  return (
    <div className={cn('shrink-0 border-t border-line/60 bg-surface p-4', variant === 'compact' ? 'p-3' : 'p-4', className)}>
      <div className="max-w-4xl mx-auto">
        <div className="rounded-card border border-line bg-surface shadow-card overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-inset border-b border-line/60">
            <span className="text-xs font-medium text-ink-2">Composer</span>
            <span className="text-xs text-ink-3">({variant})</span>
          </div>
          <div className="p-3">
            <div className="rounded-control border border-line bg-canvas px-3 py-2 text-sm text-ink-3">
              {placeholder}
            </div>
            <div className="mt-3 flex justify-end">
              <Button size="sm" variant="default" className="rounded-control" disabled>
                <ChevronDown size={14} className="rotate-270" aria-hidden />
                Send
              </Button>
            </div>
          </div>
        </div>
        {ctx.state.unreadCount > 0 ? (
          <p className="mt-2 text-xs text-ink-3">
            {ctx.state.unreadCount} unread · first: {ctx.state.firstUnreadId ?? '—'}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Compound namespace — Vercel composition pattern (explicit variants, no booleans).
 * Usage:
 *   <ThreadLiveProvider ...>
 *     <ThreadLive.Frame>
 *       <ThreadLive.PinnedBanner variant="pinned" />
 *       <ThreadLive.ScrollArea variant="thread">
 *         <ThreadLive.LoadMore variant="default" />
 *         <ThreadLive.Poll variant="default" />
 *       </ThreadLive.ScrollArea>
 *       <ThreadLive.Composer variant="default" />
 *     </ThreadLive.Frame>
 *   </ThreadLiveProvider>
 */
export const ThreadLive = {
  Frame: ThreadLiveFrame,
  ScrollArea: ThreadLiveScrollArea,
  PinnedBanner: ThreadLivePinnedBanner,
  LoadMore: ThreadLiveLoadMore,
  Poll: ThreadLivePoll,
  Composer: ThreadLiveComposer,
};

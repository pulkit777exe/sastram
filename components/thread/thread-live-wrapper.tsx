'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CommentTree } from '@/components/thread/comment-tree';
import { PostMessageForm } from '@/components/chat/post-message-form';
import { useAIReplyStream, type AIStreamStart, type AIStreamError } from '@/hooks/useAIReplyStream';
import type { AiInlineMeta, Message } from '@/lib/types/index';
import { PollPanel } from '@/components/thread/poll-panel';
import { InlinePoll } from '@/components/thread/inline-poll';
import { getPollResultsAction, getPollByThreadAction } from '@/modules/polls/actions';
import type { PollResults } from '@/modules/polls/types';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { ThreadPageHeader } from './thread-page-header';
import { SaiViewTransition } from '@/components/ui/view-transition';
import { ChevronDown, Loader2, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useThreadMessages } from '@/hooks/thread/use-thread-messages';
import { useThreadPolling } from '@/hooks/thread/use-thread-polling';
import { useThreadReadReceipts } from '@/hooks/thread/use-thread-read-receipts';

const SAI_MENTION_RE = /\B@sai\b/i;

// Magic numbers with intent
const AI_PENDING_TIMEOUT_MS = 120_000;
const SCROLL_BOTTOM_THRESHOLD_PX = 80;
const SCROLLED_UP_THRESHOLD_PX = 120;
const READ_DEBOUNCE_MS = 250;
const SCROLL_DEBOUNCE_MS = 100;
const POLL_REFRESH_MS = 20_000;
const SENTINEL_ROOT_MARGIN = '200px 0px 0px 0px';

function EmptyThreadState({ title, onCreatePoll }: { title: string; onCreatePoll: () => void }) {
  function focusComposer() {
    document.querySelector<HTMLTextAreaElement>('textarea[placeholder*="Reply"]')?.focus();
  }

  return (
    <div className="py-10">
      <SaiViewTransition name="thread-empty-state">
        <div className="rounded-card border border-line bg-surface shadow-card p-6">
          <div className="flex items-start gap-3 mb-5">
            <span className="size-2.5 rounded-full bg-sai-green mt-2 shrink-0" aria-hidden />
            <div className="min-w-0">
              <h3 className="font-serif-heading text-[17px] leading-tight text-ink">Start the thread</h3>
              <p className="text-[13px] leading-relaxed text-ink-2 mt-1">
                <span className="font-medium text-ink">{title}</span> has no replies yet. Sastram threads work best when the first message sets the question type — @sai will track Thread DNA and resolution from there.
              </p>
            </div>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-3">
            <button type="button" onClick={focusComposer} className="text-left rounded-card border border-line bg-canvas hover:bg-hover p-3.5 transition-colors">
              <span className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
                <span className="grid size-7 place-items-center rounded-control bg-sai-accent-tint text-sai-accent text-[11px] font-bold">@</span>
                Ask @sai
              </span>
              <span className="block text-[12px] leading-relaxed text-ink-2 mt-1.5">Mention @sai with your question — it replies in-thread with grounded context.</span>
            </button>
            <button type="button" onClick={focusComposer} className="text-left rounded-card border border-line bg-canvas hover:bg-hover p-3.5 transition-colors">
              <span className="text-[12.5px] font-semibold text-ink">Add context</span>
              <span className="block text-[12px] leading-relaxed text-ink-2 mt-1.5">Paste sources or set the expertise level so Thread DNA classifies it correctly.</span>
            </button>
            <button type="button" onClick={onCreatePoll} className="text-left rounded-card border border-line bg-canvas hover:bg-hover p-3.5 transition-colors">
              <span className="text-[12.5px] font-semibold text-ink">Create a poll</span>
              <span className="block text-[12px] leading-relaxed text-ink-2 mt-1.5">Use a poll when you need consensus — results feed the resolution score.</span>
            </button>
          </div>
          <p className="text-[11px] text-ink-3 mt-4">Tip: first message determines the thread’s question type and read time. Be specific.</p>
        </div>
      </SaiViewTransition>
    </div>
  );
}

function LoadMoreButton({
  isLoading,
  remaining,
  onLoadMore,
}: {
  isLoading: boolean;
  remaining: number;
  onLoadMore: () => void;
}) {
  if (isLoading) {
    return (
      <Button variant="outline" size="sm" onClick={onLoadMore} disabled>
        <Loader2 size={14} className="animate-spin" />
        Loading...
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={onLoadMore}>
      Load older messages ({remaining} remaining)
    </Button>
  );
}

function PinnedBanner({ message }: { message: Message }) {
  function handleJump() {
    document.getElementById(`message-${message.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <div className="shrink-0 px-6 pt-3">
      <div className="max-w-4xl mx-auto flex items-center gap-2 px-4 py-2 rounded-card border border-line bg-surface animate-in fade-in slide-in-from-top-1 duration-150">
        <Pin size={13} className="text-ink-3 shrink-0" />
        <span className="min-w-0 truncate text-xs text-ink-2 font-medium">{message.content}</span>
        <button type="button" className="shrink-0 text-xs font-semibold text-sai-accent hover:underline" onClick={handleJump}>
          Jump
        </button>
      </div>
    </div>
  );
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
  resolutionScore?: number | null;
  aiSummary?: string | null;
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
  resolutionScore: _resolutionScore = null,
  aiSummary: _aiSummary = null,
}: ThreadLiveWrapperProps) {
  // Poll state
  const [showPoll, setShowPoll] = useState(false);
  const [currentPoll, setCurrentPoll] = useState(poll);
  const [pollResults, setPollResults] = useState<PollResults | null>(null);
  const [pollRefreshKey, setPollRefreshKey] = useState(0);

  // AI inline status
  const [aiInlineStatus, setAiInlineStatus] = useState<Record<string, 'pending' | 'failed'>>({});
  const aiInlineStatusRef = useRef(aiInlineStatus);
  useEffect(() => {
    aiInlineStatusRef.current = aiInlineStatus;
  }, [aiInlineStatus]);

  // Scroll state
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const readDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiInlineTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Sub-hooks
  const threadMessages = useThreadMessages({
    initialMessages: messages,
    threadId,
    title,
    slug,
    hasMoreMessages: initialHasMore,
    nextCursor: initialNextCursor,
    totalMessageCount,
  });

  // Stable — used by read-receipts hook
  const isAtBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_BOTTOM_THRESHOLD_PX;
  }, []);

  const readReceipts = useThreadReadReceipts({
    threadId,
    initialUnreadCount,
    initialFirstUnreadMessageId,
    liveMessagesRef: threadMessages.liveMessagesRef,
    isAtBottom,
  });

  // AI inline helpers
  // Stable: used in polling + effects
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

  // Plain function: cheap, only used in handlers
  function setAiPending(messageId: string) {
    setAiInlineStatus((prev) => ({ ...prev, [messageId]: 'pending' }));
    const existing = aiInlineTimerRef.current.get(messageId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      setAiInlineStatus((prev) => {
        if (prev[messageId] !== 'pending') return prev;
        return { ...prev, [messageId]: 'failed' };
      });
      aiInlineTimerRef.current.delete(messageId);
    }, AI_PENDING_TIMEOUT_MS);
    aiInlineTimerRef.current.set(messageId, timer);
  }

  const streamParentRef = useRef<string | null>(null);

  // Derived — cheap, no memo needed
  const pinnedMessage = threadMessages.liveMessages.find((m) => m.isPinned) ?? null;

  function hasAiMention(content: string) {
    return SAI_MENTION_RE.test(content);
  }

  // ---- AI stream handlers (plain functions) ----
  function handleStreamStart(info: AIStreamStart) {
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
  }

  function handleStreamUpdate(messageId: string, content: string) {
    threadMessages.updateMessageContent(messageId, content);
  }

  function handleStreamDone() {
    const parentId = streamParentRef.current;
    streamParentRef.current = null;
    if (parentId) clearAiStatus(parentId);
  }

  function handleStreamError(_err: AIStreamError) {
    const parentId = streamParentRef.current;
    streamParentRef.current = null;
    fetch(`/api/threads/${threadId}/ai-reply`, { method: 'POST' })
      .then((res) => {
        if (!res.ok) throw new Error('fallback enqueue failed');
      })
      .catch((error) => {
        console.error('[thread-live] AI-reply fallback enqueue failed:', error);
        if (parentId) {
          setAiInlineStatus((prev) => (prev[parentId] === 'pending' ? { ...prev, [parentId]: 'failed' } : prev));
        }
      });
  }

  const { startStream, stopStream } = useAIReplyStream({
    threadId,
    onStart: handleStreamStart,
    onMessageUpdate: handleStreamUpdate,
    onDone: handleStreamDone,
    onError: handleStreamError,
  });

  function resolveAiInlineStatus(meta: AiInlineMeta | undefined, messageContent: string): AiInlineMeta['aiInline'] {
    if (meta?.aiInline !== undefined) return meta.aiInline as AiInlineMeta['aiInline'];
    if (hasAiMention(messageContent)) return 'queued';
    return null;
  }

  function handleMessagePosted(newMessage: Message, meta?: AiInlineMeta) {
    threadMessages.addMessage(newMessage);

    const aiInline = resolveAiInlineStatus(meta, newMessage.content);
    if (aiInline === 'streaming') {
      setAiPending(newMessage.id);
      streamParentRef.current = newMessage.id;
      startStream(newMessage.id);
    } else if (aiInline === 'queued') {
      setAiPending(newMessage.id);
    }
  }

  function handleOptimisticMessage(optimisticMsg: Message) {
    threadMessages.addOptimistic(optimisticMsg);
  }

  function handleMessageError(tempId: string) {
    threadMessages.removeOptimistic(tempId);
  }

  // Load more observer
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    const root = scrollContainerRef.current;
    if (!sentinel || !root || !threadMessages.hasMoreMessages) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void threadMessages.loadMoreMessages();
        }
      },
      { root, rootMargin: SENTINEL_ROOT_MARGIN }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- threadMessages fields stable; object identity unstable
  }, [threadMessages.hasMoreMessages, threadMessages.loadMoreMessages]);

  // Polling
  useThreadPolling({
    threadId,
    lastMessageTimestampRef: threadMessages.lastMessageTimestampRef,
    aiInlineStatusRef,
    liveMessagesRef: threadMessages.liveMessagesRef,
    mapBackfillMessage: threadMessages.mapBackfillMessage,
    mergeBackfill: threadMessages.mergeBackfill,
    onAiStatusCleared: clearAiStatus,
  });

  // Cleanup
  useEffect(() => {
    const timers = aiInlineTimerRef.current;
    return () => {
      if (readDebounceRef.current) clearTimeout(readDebounceRef.current);
      if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      stopStream();
    };
  }, [stopStream]);

  // AI pending -> clear when response arrives
  useEffect(() => {
    for (const [pendingMsgId, status] of Object.entries(aiInlineStatus)) {
      if (status !== 'pending') continue;
      if (
        threadMessages.liveMessages.some(
          (m) => m.parentId === pendingMsgId && m.isAiResponse && m.content.trim().length > 0
        )
      ) {
        // Defer to next tick to avoid setState during effect
        setTimeout(() => clearAiStatus(pendingMsgId), 0);
      }
    }
  }, [threadMessages.liveMessages, aiInlineStatus, clearAiStatus]);

  // Poll refresh — skip when tab hidden
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
          setCurrentPoll((prev) => (prev ? { ...prev, isActive: freshPoll.isActive, expiresAt: freshPoll.expiresAt } : prev));
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

  // Derived flags — cheap, no memo
  const hasPinnedMessage = pinnedMessage !== null;
  const isEmptyThread = threadMessages.liveMessages.length === 0;
  const hasMoreToLoad = threadMessages.hasMoreMessages;
  const isLoadingMore = threadMessages.isLoadingMore;
  const remainingToLoad = threadMessages.totalMessageCount - threadMessages.displayedCount;
  const showScrollButton = isScrolledUp;

  // Scroll handlers — plain functions
  function handleViewportScroll() {
    if (readDebounceRef.current) clearTimeout(readDebounceRef.current);
    readDebounceRef.current = setTimeout(() => {
      void readReceipts.markThreadAsRead(false);
    }, READ_DEBOUNCE_MS);
    if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
    scrollDebounceRef.current = setTimeout(() => {
      const el = scrollContainerRef.current;
      if (el) setIsScrolledUp(el.scrollHeight - el.scrollTop - el.clientHeight > SCROLLED_UP_THRESHOLD_PX);
    }, SCROLL_DEBOUNCE_MS);
  }

  function handleScrollToBottom() {
    scrollContainerRef.current?.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' });
    void readReceipts.markThreadAsRead(true);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ThreadPageHeader title={title} threadId={threadId} slug={slug} initialFrequency={initialFrequency} />

      {hasPinnedMessage && <PinnedBanner message={pinnedMessage as Message} />}

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-6 py-4"
        role="log"
        aria-live="polite"
        aria-label="Thread messages"
        onScroll={handleViewportScroll}
      >
        {/* Poll section */}
        <div className="max-w-4xl mx-auto">
          <InlinePoll
            threadId={threadId}
            canManagePoll={canManagePoll}
            isOpen={showPoll}
            onToggle={setShowPoll}
            onPollCreated={(newPoll) => {
              setCurrentPoll(newPoll);
            }}
          />
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

        {/* Thread content */}
        <div className="max-w-4xl mx-auto">
          {isEmptyThread ? (
            <EmptyThreadState title={title} onCreatePoll={() => setShowPoll(true)} />
          ) : (
            <ErrorBoundary>
              {hasMoreToLoad && (
                <>
                  <div ref={loadMoreSentinelRef} aria-hidden className="h-px" />
                  <div className="mb-4 flex justify-center">
                    <LoadMoreButton isLoading={isLoadingMore} remaining={remainingToLoad} onLoadMore={threadMessages.loadMoreMessages} />
                  </div>
                </>
              )}
              <CommentTree
                messages={threadMessages.liveMessages}
                threadId={threadId}
                currentUser={currentUser}
                aiInlineStatus={aiInlineStatus}
                onOptimisticMessage={handleOptimisticMessage}
                onMessagePosted={handleMessagePosted}
                firstUnreadMessageId={readReceipts.firstUnreadMessageId}
                scrollContainerRef={scrollContainerRef}
              />
            </ErrorBoundary>
          )}
        </div>
      </div>

      {showScrollButton && (
        <div className="absolute bottom-32 right-6 z-30 flex flex-col items-center gap-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <Button
            size="icon"
            className="relative w-9 h-9 rounded-full bg-brand hover:bg-brand/90 text-primary-foreground shadow-linear-lg hover:scale-110 active:scale-95"
            onClick={handleScrollToBottom}
            title="Scroll to bottom"
          >
            {readReceipts.unreadCount > 0 && (
              <span className="absolute -top-2 -right-2 min-w-4.5 h-4.5 rounded-full bg-brand text-primary-foreground text-xs font-bold flex items-center justify-center px-1 border-2 border-background">
                {readReceipts.unreadCount > 99 ? '99+' : readReceipts.unreadCount}
              </span>
            )}
            <ChevronDown size={16} strokeWidth={2.5} />
          </Button>
        </div>
      )}

      <div className="p-4 border-t border-line/60 shrink-0">
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

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ChevronDown, Loader2, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useThreadMessages } from '@/hooks/thread/use-thread-messages';
import { useThreadPolling } from '@/hooks/thread/use-thread-polling';
import { useThreadReadReceipts } from '@/hooks/thread/use-thread-read-receipts';

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
  resolutionScore = null,
  aiSummary = null,
}: ThreadLiveWrapperProps) {
  // Poll state
  const [showPoll, setShowPoll] = useState(false);
  const [currentPoll, setCurrentPoll] = useState(poll);
  const [pollResults, setPollResults] = useState<PollResults | null>(null);
  const [pollRefreshKey, setPollRefreshKey] = useState(0);
  const currentPollRef = useRef(currentPoll);
  useEffect(() => { currentPollRef.current = currentPoll; });

  // AI inline status
  const [aiInlineStatus, setAiInlineStatus] = useState<Record<string, 'pending' | 'failed'>>({});
  const aiInlineStatusRef = useRef(aiInlineStatus);
  useEffect(() => { aiInlineStatusRef.current = aiInlineStatus; });

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

  const isAtBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
  }, []);

  const readReceipts = useThreadReadReceipts({
    threadId,
    initialUnreadCount,
    initialFirstUnreadMessageId,
    liveMessagesRef: threadMessages.liveMessagesRef,
    isAtBottom,
  });

  // AI inline helpers
  const setAiPending = useCallback((messageId: string) => {
    setAiInlineStatus((prev) => ({ ...prev, [messageId]: 'pending' }));
    const existing = aiInlineTimerRef.current.get(messageId);
    if (existing) clearTimeout(existing);
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

  const streamParentRef = useRef<string | null>(null);
  const pinnedMessage = useMemo(() => threadMessages.liveMessages.find((m) => m.isPinned) ?? null, [threadMessages.liveMessages]);
  const hasAiMention = useCallback((content: string) => /\B@sai\b/i.test(content), []);

  // AI stream handlers
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
    [threadId, title, slug, threadMessages.addMessage]
  );

  const handleStreamUpdate = useCallback((messageId: string, content: string) => {
    threadMessages.updateMessageContent(messageId, content);
  }, [threadMessages.updateMessageContent]);

  const handleStreamDone = useCallback(() => {
    const parentId = streamParentRef.current;
    streamParentRef.current = null;
    if (parentId) clearAiStatus(parentId);
  }, [clearAiStatus]);

  const handleStreamError = useCallback(
    (_err: AIStreamError) => {
      const parentId = streamParentRef.current;
      streamParentRef.current = null;
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

  const handleMessagePosted = useCallback(
    (newMessage: Message, meta?: AiInlineMeta) => {
      threadMessages.addMessage(newMessage);

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
    [hasAiMention, setAiPending, startStream, threadMessages.addMessage]
  );

  const handleOptimisticMessage = useCallback(
    (optimisticMsg: Message) => {
      threadMessages.addOptimistic(optimisticMsg);
    },
    [threadMessages.addOptimistic]
  );

  const handleMessageError = useCallback(
    (tempId: string) => {
      threadMessages.removeOptimistic(tempId);
    },
    [threadMessages.removeOptimistic]
  );

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
      { root, rootMargin: '200px 0px 0px 0px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
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
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
      stopStream();
    };
  }, [stopStream]);

  // Poll AI inline status — check if response arrived
  useEffect(() => {
    for (const [pendingMsgId, status] of Object.entries(aiInlineStatus)) {
      if (status !== 'pending') continue;
      if (
        threadMessages.liveMessages.some(
          (m) => m.parentId === pendingMsgId && m.isAiResponse && m.content.trim().length > 0
        )
      ) {
        setTimeout(() => clearAiStatus(pendingMsgId), 0);
      }
    }
  }, [threadMessages.liveMessages, aiInlineStatus, clearAiStatus]);

  // Poll refresh (non-fast-mode) — skip when tab is hidden
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
          setCurrentPoll((prev) =>
            prev ? { ...prev, isActive: freshPoll.isActive, expiresAt: freshPoll.expiresAt } : prev
          );
        }
        if (freshResultsResult?.data) {
          setPollResults(freshResultsResult.data);
          setPollRefreshKey((k) => k + 1);
        }
      } catch {
        // Poll refresh is best-effort
      }
    }, 20_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentPoll, threadId]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ThreadPageHeader
        title={title}
        threadId={threadId}
        slug={slug}
        initialFrequency={initialFrequency}
      />

      {(pinnedMessage) && (
        <div className="shrink-0 px-6 pt-3">
          <div className="max-w-4xl mx-auto flex items-center gap-2 px-4 py-2 rounded-card border border-line bg-surface animate-in fade-in slide-in-from-top-1 duration-150">
            <Pin size={13} className="text-ink-3 shrink-0" />
            <span className="min-w-0 truncate text-xs text-ink-2 font-medium">
              {pinnedMessage.content}
            </span>
            <button
              type="button"
              className="shrink-0 text-xs font-semibold text-sai-accent hover:underline"
              onClick={() =>
                document
                  .getElementById(`message-${pinnedMessage.id}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }
            >
              Jump
            </button>
          </div>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-6 py-4"
        role="log"
        aria-live="polite"
        aria-label="Thread messages"
        onScroll={() => {
          if (readDebounceRef.current) clearTimeout(readDebounceRef.current);
          readDebounceRef.current = setTimeout(() => {
            void readReceipts.markThreadAsRead(false);
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

        <div className="max-w-4xl mx-auto">
          {threadMessages.liveMessages.length === 0 ? (
            <div className="py-10">
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
                  <button
                    type="button"
                    onClick={() => document.querySelector<HTMLTextAreaElement>('textarea[placeholder*="Reply"]')?.focus()}
                    className="text-left rounded-card border border-line bg-canvas hover:bg-hover p-3.5 transition-colors"
                  >
                    <span className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
                      <span className="grid size-7 place-items-center rounded-control bg-sai-accent-tint text-sai-accent text-[11px] font-bold">@</span>
                      Ask @sai
                    </span>
                    <span className="block text-[12px] leading-relaxed text-ink-2 mt-1.5">Mention @sai with your question — it replies in-thread with grounded context.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => document.querySelector<HTMLTextAreaElement>('textarea[placeholder*="Reply"]')?.focus()}
                    className="text-left rounded-card border border-line bg-canvas hover:bg-hover p-3.5 transition-colors"
                  >
                    <span className="text-[12.5px] font-semibold text-ink">Add context</span>
                    <span className="block text-[12px] leading-relaxed text-ink-2 mt-1.5">Paste sources or set the expertise level so Thread DNA classifies it correctly.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPoll(true)}
                    className="text-left rounded-card border border-line bg-canvas hover:bg-hover p-3.5 transition-colors"
                  >
                    <span className="text-[12.5px] font-semibold text-ink">Create a poll</span>
                    <span className="block text-[12px] leading-relaxed text-ink-2 mt-1.5">Use a poll when you need consensus — results feed the resolution score.</span>
                  </button>
                </div>
                <p className="text-[11px] text-ink-3 mt-4">
                  Tip: first message determines the thread’s question type and read time. Be specific.
                </p>
              </div>
            </div>
          ) : (
            <ErrorBoundary>
              {threadMessages.hasMoreMessages && (
                <>
                  <div ref={loadMoreSentinelRef} aria-hidden className="h-px" />
                  <div className="mb-4 flex justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={threadMessages.loadMoreMessages}
                      disabled={threadMessages.isLoadingMore}
                    >
                      {threadMessages.isLoadingMore ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          Load older messages ({threadMessages.totalMessageCount - threadMessages.displayedCount} remaining)
                        </>
                      )}
                    </Button>
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

      {isScrolledUp && (
        <div className="absolute bottom-32 right-6 z-30 flex flex-col items-center gap-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <Button
            size="icon"
            className="relative w-9 h-9 rounded-full bg-brand hover:bg-brand/90 text-primary-foreground shadow-linear-lg hover:scale-110 active:scale-95"
            onClick={() => {
              scrollContainerRef.current?.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' });
              void readReceipts.markThreadAsRead(true);
            }}
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

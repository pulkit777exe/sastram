'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommentTree } from '@/components/thread/comment-tree';
import { PostMessageForm } from '@/modules/chat/components/post-message-form';
import { useThreadWebSocket, type TypingUser } from '@/hooks/useThreadWebSocket';
import type { Message } from '@/lib/types/index';
import TimeAgo from '@/components/ui/TimeAgo';
import { PollPanel } from '@/components/thread/poll-panel';
import { markThreadReadAction } from '@/modules/read-receipts/actions';
import { toasts } from '@/lib/utils/toast';

interface ThreadLiveWrapperProps {
  messages: Message[];
  threadId: string;
  initialUnreadCount: number;
  initialFirstUnreadMessageId: string | null;
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
}

export function ThreadLiveWrapper({
  messages,
  threadId,
  initialUnreadCount,
  initialFirstUnreadMessageId,
  poll,
  canManagePoll,
  currentUser,
}: ThreadLiveWrapperProps) {
  const [liveMessages, setLiveMessages] = useState<Message[]>(messages);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [aiInlineStatus, setAiInlineStatus] = useState<Record<string, 'pending' | 'failed'>>({});
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState(initialFirstUnreadMessageId);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const readDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMarkingReadRef = useRef(false);
  const ownPendingIds = useRef<Set<string>>(new Set());
  const aiInlineTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── REFS for markThreadAsRead ─────────────────────────────────────────
  // Avoids stale closure AND prevents "setState inside setState" React warning.
  // markThreadAsRead reads from these refs rather than from state directly.

  const liveMessagesRef = useRef<Message[]>(messages);
  useEffect(() => {
    liveMessagesRef.current = liveMessages;
  }, [liveMessages]);

  const unreadCountRef = useRef(initialUnreadCount);
  useEffect(() => {
    unreadCountRef.current = unreadCount;
  }, [unreadCount]);

  // ── DERIVED ───────────────────────────────────────────────────────────

  const pinnedMessage = useMemo(() => liveMessages.find((m) => m.isPinned) ?? null, [liveMessages]);

  const hasAiMention = useCallback((content: string) => /\B@ai\b/i.test(content), []);

  const isAtBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
  }, []);

  // ── @AI STATUS ────────────────────────────────────────────────────────

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

  // ── MARK AS READ ──────────────────────────────────────────────────────
  // Reads from refs — NOT from state or inside a setState updater.
  // Previous version had setState calls inside setLiveMessages updater
  // which caused "Cannot update component while rendering" React error.

  const markThreadAsRead = useCallback(
    async (force: boolean = false) => {
      if (unreadCountRef.current <= 0) return;
      if (isMarkingReadRef.current) return;
      if (!force && !isAtBottom()) return;

      const latestId = liveMessagesRef.current[liveMessagesRef.current.length - 1]?.id ?? null;

      isMarkingReadRef.current = true;
      const result = await markThreadReadAction(threadId, latestId);
      isMarkingReadRef.current = false;

      if (result.error) {
        toasts.serverError();
        return;
      }

      setUnreadCount(0);
      setFirstUnreadMessageId(null);
    },
    [isAtBottom, threadId]
  );

  // ── WEBSOCKET HANDLERS ────────────────────────────────────────────────

  const handleWsNewMessage = useCallback(
    (newMessage: Message) => {
      const wasAtBottom = isAtBottom();

      setLiveMessages((prev) => {
        // Own message already added via handleMessagePosted
        if (ownPendingIds.current.has(newMessage.id)) {
          ownPendingIds.current.delete(newMessage.id);
          return prev.map((m) => (m.id === newMessage.id ? { ...m, ...newMessage } : m));
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
      console.log('[ThreadLiveWrapper] handleAiComplete:', parentMessageId);
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

  const handleTypingUpdate = useCallback((typers: TypingUser[]) => {
    setTypingUsers(typers);
  }, []);

  const { emitTypingStart, emitTypingStop } = useThreadWebSocket({
    threadId,
    currentUserId: currentUser.id,
    onNewMessage: handleWsNewMessage,
    onMessageDeleted: handleWsMessageDeleted,
    onPinUpdate: handleWsPinUpdate,
    onTypingUpdate: handleTypingUpdate,
    onAiComplete: handleAiComplete, // ← clears "pending" when stream ends
  });

  // ── POST HANDLER ──────────────────────────────────────────────────────

  const handleMessagePosted = useCallback(
    (newMessage: Message) => {
      ownPendingIds.current.add(newMessage.id);
      setLiveMessages((prev) => [...prev, newMessage]);
      emitTypingStop();
      if (hasAiMention(newMessage.content)) {
        setAiPending(newMessage.id);
      }
    },
    [emitTypingStop, hasAiMention, setAiPending]
  );

  // ── SCROLL TO FIRST UNREAD ────────────────────────────────────────────

  const scrollToFirstUnread = useCallback(() => {
    if (firstUnreadMessageId) {
      document
        .getElementById(`message-${firstUnreadMessageId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [firstUnreadMessageId]);

  // ── AUTO READ TIMER ───────────────────────────────────────────────────

  useEffect(() => {
    if (unreadCount <= 0) return;
    const timer = setTimeout(() => {
      void markThreadAsRead(true);
    }, 30_000);
    return () => clearTimeout(timer);
  }, [unreadCount, markThreadAsRead]);

  // ── CLEANUP ───────────────────────────────────────────────────────────

  useEffect(() => {
    const timers = aiInlineTimerRef.current;
    return () => {
      if (readDebounceRef.current) clearTimeout(readDebounceRef.current);
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  // ── RENDER ────────────────────────────────────────────────────────────

  return (
    <>
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        onScroll={() => {
          if (readDebounceRef.current) clearTimeout(readDebounceRef.current);
          readDebounceRef.current = setTimeout(() => {
            void markThreadAsRead(false);
          }, 250);
        }}
      >
        <div className="max-w-4xl mx-auto p-6 md:p-8">
          <PollPanel threadId={threadId} initialPoll={poll} canManagePoll={canManagePoll} />

          {unreadCount > 0 && (
            <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-blue-700">
                  {unreadCount} unread {unreadCount === 1 ? 'message' : 'messages'}
                </p>
                <button
                  type="button"
                  className="text-xs font-medium text-blue-700 underline hover:text-blue-900"
                  onClick={scrollToFirstUnread}
                >
                  Scroll to first unread
                </button>
              </div>
            </div>
          )}

          {pinnedMessage && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-amber-700">
                    📌 Pinned by {pinnedMessage.sender.name || 'Anonymous'} ·{' '}
                    <TimeAgo date={pinnedMessage.createdAt} />
                  </p>
                  <p className="mt-1 truncate text-sm text-amber-900">{pinnedMessage.content}</p>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-xs font-medium text-amber-700 hover:text-amber-900 underline"
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

          {liveMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <h3 className="text-foreground font-medium mb-1">No comments yet</h3>
              <p className="text-muted-foreground text-sm">
                Be the first to share your thoughts on this topic!
              </p>
            </div>
          ) : (
            <CommentTree
              messages={liveMessages}
              threadId={threadId}
              currentUser={currentUser}
              aiInlineStatus={aiInlineStatus}
              onTypingStart={emitTypingStart}
              onTypingStop={emitTypingStop}
            />
          )}
        </div>
      </div>

      {typingUsers.length > 0 && (
        <div className="px-8 py-1.5 text-xs text-muted-foreground">
          <div className="max-w-4xl mx-auto flex items-center gap-2">
            <div className="flex gap-0.5">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
            <span>
              {typingUsers.length === 1
                ? `${typingUsers[0].userName} is typing...`
                : typingUsers.length === 2
                  ? `${typingUsers[0].userName} and ${typingUsers[1].userName} are typing...`
                  : 'Several people are typing...'}
            </span>
          </div>
        </div>
      )}

      <div className="p-4 bg-background border-t border-border/60">
        <div className="max-w-4xl mx-auto">
          <PostMessageForm
            sectionId={threadId}
            onMessagePosted={handleMessagePosted}
            onTypingStart={emitTypingStart}
            onTypingStop={emitTypingStop}
          />
        </div>
      </div>
    </>
  );
}

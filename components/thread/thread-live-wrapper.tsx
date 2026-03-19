"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { CommentTree } from "@/components/thread/comment-tree";
import { PostMessageForm } from "@/modules/chat/components/post-message-form";
import { useThreadWebSocket, type TypingUser } from "@/hooks/useThreadWebSocket";
import type { Message } from "@/lib/types/index";
import TimeAgo from "@/components/ui/TimeAgo";

interface ThreadLiveWrapperProps {
  messages: Message[];
  threadId: string;
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
  currentUser,
}: ThreadLiveWrapperProps) {
  const [liveMessages, setLiveMessages] = useState<Message[]>(messages);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const animateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [animateId, setAnimateId] = useState<string | null>(null);

  const pinnedMessage = useMemo(
    () => liveMessages.find((message) => message.isPinned) ?? null,
    [liveMessages],
  );

  const handleWsNewMessage = useCallback((newMessage: Message) => {
    setLiveMessages((prev) => [...prev, newMessage]);
    setAnimateId(newMessage.id);
    if (animateTimerRef.current) clearTimeout(animateTimerRef.current);
    animateTimerRef.current = setTimeout(() => setAnimateId(null), 700);
  }, []);

  const handleWsMessageDeleted = useCallback((messageId: string) => {
    setLiveMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, deletedAt: new Date() } : m
      )
    );
  }, []);

  const handleWsPinUpdate = useCallback((messageId: string, isPinned: boolean) => {
    setLiveMessages((prev) =>
      prev.map((message) => ({
        ...message,
        isPinned: message.id === messageId ? isPinned : isPinned ? false : message.isPinned,
      })),
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
  });

  const handleMessagePosted = useCallback(
    (newMessage: Message) => {
      setLiveMessages((prev) => [...prev, newMessage]);
      setAnimateId(newMessage.id);
      if (animateTimerRef.current) clearTimeout(animateTimerRef.current);
      animateTimerRef.current = setTimeout(() => setAnimateId(null), 700);
      emitTypingStop();
    },
    [emitTypingStop]
  );

  // Suppress animateId to avoid lint — it's available if CommentTree needs it
  void animateId;

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 md:p-8">
          {pinnedMessage && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-amber-700">
                    📌 Pinned message by {pinnedMessage.sender.name || "Anonymous"} ·{" "}
                    <TimeAgo date={pinnedMessage.createdAt} />
                  </p>
                  <p className="mt-1 truncate text-sm text-amber-900">
                    {pinnedMessage.content}
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-xs font-medium text-amber-700 hover:text-amber-900 underline"
                  onClick={() => {
                    const target = document.getElementById(
                      `message-${pinnedMessage.id}`,
                    );
                    target?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  Jump to message
                </button>
              </div>
            </div>
          )}

          {liveMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
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
            onTypingStart={emitTypingStart}
            onTypingStop={emitTypingStop}
          />
          )}
        </div>
      </div>

      {/* Typing indicators */}
      {typingUsers.length > 0 && (
        <div className="px-8 py-1.5 text-xs text-muted-foreground">
          <div className="max-w-4xl mx-auto flex items-center gap-2">
            <div className="flex gap-0.5">
              <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <span>
              {typingUsers.length === 1
                ? `${typingUsers[0].userName} is typing...`
                : typingUsers.length === 2
                  ? `${typingUsers[0].userName} and ${typingUsers[1].userName} are typing...`
                  : "Several people are typing..."}
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

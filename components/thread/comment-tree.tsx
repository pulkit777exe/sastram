'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { Message } from '@/lib/types/index';
import type { MessageNode } from '@/modules/messages/types';
import {
  buildMessageTree,
  loadCollapseStates,
  saveCollapseState,
} from '@/modules/messages/service';
import { CommentNode } from './message-node';

function findNodeById(nodes: MessageNode[], id: string): MessageNode | null {
  const stack = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.id === id) return node;
    if (node.children.length > 0) {
      stack.push(...node.children);
    }
  }
  return null;
}

interface CommentTreeProps {
  messages: Message[];
  threadId: string;
  currentUser: {
    id: string;
    name: string | null;
    image: string | null;
    role?: string;
  };
  aiInlineStatus?: Record<string, 'pending' | 'failed'>;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
}

export function CommentTree({
  messages,
  threadId,
  currentUser,
  aiInlineStatus = {},
  onTypingStart,
  onTypingStop,
}: CommentTreeProps) {
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [localMessages, setLocalMessages] = useState<Message[]>(messages);
  const [animateMessageId, setAnimateMessageId] = useState<string | null>(null);
  const animateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const focusedId = searchParams.get('focus');

  useEffect(() => {
    const states = loadCollapseStates(threadId);
    const collapsed = new Set<string>();
    states.forEach((isCollapsed, messageId) => {
      if (isCollapsed) collapsed.add(messageId);
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsedIds(collapsed);
  }, [threadId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalMessages((prev) => {
      const existingMap = new Map(prev.map((msg) => [msg.id, msg]));
      const newMap = new Map(messages.map((msg) => [msg.id, msg]));
      const updated = messages.map((msg) => {
        if (existingMap.has(msg.id) && existingMap.get(msg.id)?.content !== msg.content) {
          return msg;
        }
        if (!existingMap.has(msg.id)) return msg;
        return existingMap.get(msg.id)!;
      });
      return updated.filter((msg) => newMap.has(msg.id));
    });
  }, [messages]);

  const tree = useMemo(() => buildMessageTree(localMessages), [localMessages]);
  const focusedNode = useMemo(
    () => (focusedId ? findNodeById(tree, focusedId) : null),
    [tree, focusedId]
  );

  const toggleCollapse = useCallback(
    (messageId: string) => {
      setCollapsedIds((prev) => {
        const next = new Set(prev);
        const isCollapsed = next.has(messageId);
        if (isCollapsed) {
          next.delete(messageId);
        } else {
          next.add(messageId);
        }
        saveCollapseState(threadId, messageId, !isCollapsed);
        return next;
      });
    },
    [threadId]
  );

  const handleReply = useCallback((messageId: string) => {
    setActiveReplyId((prev) => (prev === messageId ? null : messageId));
  }, []);

  const handleCancelReply = useCallback(() => {
    setActiveReplyId(null);
  }, []);

  const handleMessageUpdate = useCallback((messageId: string, updates: Partial<Message>) => {
    setLocalMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, ...updates } : m)));
  }, []);

  const handleMessagePosted = useCallback((newMessage: Message) => {
    setLocalMessages((prev) => [...prev, newMessage]);
    setActiveReplyId(null);
    setAnimateMessageId(newMessage.id);
    if (animateTimerRef.current) clearTimeout(animateTimerRef.current);
    animateTimerRef.current = setTimeout(() => setAnimateMessageId(null), 700);
  }, []);

  useEffect(() => {
    return () => {
      if (animateTimerRef.current) clearTimeout(animateTimerRef.current);
    };
  }, []);

  const handleFocusBranch = useCallback(
    (messageId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('focus', messageId);
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const clearFocus = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('focus');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [router, pathname, searchParams]);

  if (tree.length === 0) return null;

  return (
    <div className="space-y-4">
      {focusedNode ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 bg-background/80">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              Focused Thread
            </div>
            <button
              onClick={clearFocus}
              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Back to full thread
            </button>
          </div>
          <CommentNode
            key={focusedNode.id}
            node={focusedNode}
            depth={0}
            threadId={threadId}
            currentUser={currentUser}
            activeReplyId={activeReplyId}
            collapsedIds={collapsedIds}
            onReply={handleReply}
            onCancelReply={handleCancelReply}
            onToggleCollapse={toggleCollapse}
            onMessagePosted={handleMessagePosted}
            onFocusBranch={handleFocusBranch}
            onMessageUpdate={handleMessageUpdate}
            allMessages={localMessages}
            animateMessageId={animateMessageId}
            aiInlineStatus={aiInlineStatus}
            onTypingStart={onTypingStart}
            onTypingStop={onTypingStop}
          />
        </div>
      ) : (
        tree.map((node) => (
          <CommentNode
            key={node.id}
            node={node}
            depth={0}
            threadId={threadId}
            currentUser={currentUser}
            activeReplyId={activeReplyId}
            collapsedIds={collapsedIds}
            onReply={handleReply}
            onCancelReply={handleCancelReply}
            onToggleCollapse={toggleCollapse}
            onMessagePosted={handleMessagePosted}
            onFocusBranch={handleFocusBranch}
            onMessageUpdate={handleMessageUpdate}
            allMessages={localMessages}
            animateMessageId={animateMessageId}
            aiInlineStatus={aiInlineStatus}
            onTypingStart={onTypingStart}
            onTypingStop={onTypingStop}
          />
        ))
      )}
    </div>
  );
}
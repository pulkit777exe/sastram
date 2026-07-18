'use client';

import { useState, useEffect, useMemo, useRef, useCallback, type RefObject } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { Message } from '@/lib/types/index';
import type { MessageNode } from '@/modules/messages/types';
import {
  buildMessageTree,
  loadCollapseStates,
  saveCollapseState,
} from '@/modules/messages/service';
import { ThreadDataProvider, ThreadUIStateProvider } from './thread-context';
import { MessageList } from './message-list';

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

function collectAncestorIds(nodes: MessageNode[], id: string): string[] {
  const path: string[] = [];
  const walk = (current: MessageNode[], trail: string[]): boolean => {
    for (const node of current) {
      const nextTrail = [...trail, node.id];
      if (node.id === id) {
        path.push(...trail);
        return true;
      }
      if (node.children.length > 0 && walk(node.children, nextTrail)) {
        return true;
      }
    }
    return false;
  };
  walk(nodes, []);
  return path;
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
  onOptimisticMessage?: (message: Message) => void;
  firstUnreadMessageId: string | null;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

export function CommentTree({
  messages,
  threadId,
  currentUser,
  aiInlineStatus = {},
  onOptimisticMessage,
  firstUnreadMessageId,
  scrollContainerRef,
}: CommentTreeProps) {
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [localMessages, setLocalMessages] = useState<Message[]>(messages);
  const [animateMessageId, setAnimateMessageId] = useState<string | null>(null);
  const animateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevMessagesRef = useRef(messages);
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
    const prev = prevMessagesRef.current;
    if (prev === messages) return;
    prevMessagesRef.current = messages;

    if (prev.length === messages.length) {
      const same = prev.every((msg, i) => {
        const incoming = messages[i];
        return msg.id === incoming.id && msg.content === incoming.content && msg.deletedAt === incoming.deletedAt;
      });
      if (same) return;
    }
    setLocalMessages(messages);
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

  const handleReply = useCallback(
    (messageId: string) => {
      // Expand any collapsed ancestors so the message (and its reply target)
      // is visible before the reply box opens. The reply action is only
      // triggered by the reply icon, so this just ensures the target is seen.
      const ancestors = collectAncestorIds(tree, messageId);
      if (ancestors.length > 0) {
        setCollapsedIds((prev) => {
          let changed = false;
          const next = new Set(prev);
          for (const id of ancestors) {
            if (next.has(id)) {
              next.delete(id);
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }
      setActiveReplyId((prev) => (prev === messageId ? null : messageId));
    },
    [tree]
  );

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

  const dataContextValue = useMemo(
    () => ({
      threadId,
      currentUser,
      scrollContainerRef,
      onReply: handleReply,
      onCancelReply: handleCancelReply,
      onToggleCollapse: toggleCollapse,
      onMessagePosted: handleMessagePosted,
      onOptimisticMessage,
      onFocusBranch: handleFocusBranch,
      onMessageUpdate: handleMessageUpdate,
    }),
    [
      threadId, currentUser, scrollContainerRef,
      handleReply, handleCancelReply, toggleCollapse, handleMessagePosted,
      onOptimisticMessage, handleFocusBranch, handleMessageUpdate,
    ]
  );

  const uiStateContextValue = useMemo(
    () => ({
      activeReplyId,
      collapsedIds,
      allMessages: localMessages,
      animateMessageId,
      aiInlineStatus,
    }),
    [activeReplyId, collapsedIds, localMessages, animateMessageId, aiInlineStatus]
  );

  if (localMessages.length === 0) return null;

  return (
    <ThreadDataProvider value={dataContextValue}>
      <ThreadUIStateProvider value={uiStateContextValue}>
        <MessageList firstUnreadMessageId={firstUnreadMessageId} />
      </ThreadUIStateProvider>
    </ThreadDataProvider>
  );
}
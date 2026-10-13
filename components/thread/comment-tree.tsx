'use client';

import { useState, useEffect, useMemo, useRef, useCallback, type RefObject } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { AiInlineMeta, Message } from '@/lib/types/index';
import type { AiInlineStatusMap } from '@/hooks/thread/ai-inline-status';
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

function collectAncestorIds(nodes: MessageNode[], targetId: string): string[] {
  // Build a parent lookup table with an explicit loop — no recursion, no spread
  const parentById = new Map<string, string | null>();
  const stack: Array<{ node: MessageNode; parentId: string | null }> = [];

  for (const node of nodes) {
    stack.push({ node, parentId: null });
  }

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const { node, parentId } = current;
    parentById.set(node.id, parentId);
    for (const child of node.children) {
      stack.push({ node: child, parentId: node.id });
    }
  }

  // Walk up from target to collect ancestors
  const ancestors: string[] = [];
  let currentId: string | null | undefined = parentById.get(targetId);

  while (currentId) {
    ancestors.push(currentId);
    currentId = parentById.get(currentId) ?? null;
  }

  // Reverse to get root-first order (original trail order)
  ancestors.reverse();
  return ancestors;
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
  aiInlineStatus?: AiInlineStatusMap;
  onOptimisticMessage?: (message: Message) => void;
  /**
   * Notified for messages posted from inline reply boxes, so the parent
   * (ThreadLiveWrapper) can track the message and kick off the @sai
   * streaming/pending flow. Without this, inline @sai replies were invisible
   * to the wrapper and never triggered AI delivery.
   */
  onMessagePosted?: (message: Message, meta?: AiInlineMeta) => void;
  onMessageUpdate?: (messageId: string, updates: Partial<Message>) => void;
  firstUnreadMessageId: string | null;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

export function CommentTree({
  messages,
  threadId,
  currentUser,
  aiInlineStatus = {},
  onOptimisticMessage,
  onMessagePosted,
  onMessageUpdate,
  firstUnreadMessageId,
  scrollContainerRef,
}: CommentTreeProps) {
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
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
    setCollapsedIds(collapsed);
  }, [threadId]);

  // Pure: tree derives directly from props via useMemo — no local shadow copy.
  const tree = useMemo(() => buildMessageTree(messages), [messages]);
  const _focusedNode = useMemo(
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

  const handleMessageUpdate = useCallback(
    (messageId: string, updates: Partial<Message>) => {
      // Pure: bubble to the sync owner (useThreadSync.applyMessagePatch).
      onMessageUpdate?.(messageId, updates);
    },
    [onMessageUpdate]
  );

  const handleMessagePosted = useCallback((newMessage: Message, meta?: AiInlineMeta) => {
    setActiveReplyId(null);
    setAnimateMessageId(newMessage.id);
    if (animateTimerRef.current) clearTimeout(animateTimerRef.current);
    animateTimerRef.current = setTimeout(() => setAnimateMessageId(null), 700);
    // Bubble up so ThreadLiveWrapper tracks the message and starts the
    // @sai stream / pending indicator for inline replies too.
    onMessagePosted?.(newMessage, meta);
  }, [onMessagePosted]);

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

  const _clearFocus = useCallback(() => {
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
      allMessages: messages,
      animateMessageId,
      aiInlineStatus,
    }),
    [activeReplyId, collapsedIds, messages, animateMessageId, aiInlineStatus]
  );

  if (messages.length === 0) return null;

  return (
    <ThreadDataProvider value={dataContextValue}>
      <ThreadUIStateProvider value={uiStateContextValue}>
        <MessageList firstUnreadMessageId={firstUnreadMessageId} />
      </ThreadUIStateProvider>
    </ThreadDataProvider>
  );
}

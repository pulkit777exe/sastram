'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { markThreadReadAction } from '@/modules/read-receipts/actions';
import type { Message } from '@/lib/types/index';

interface UseThreadReadReceiptsOptions {
  threadId: string;
  initialUnreadCount: number;
  initialFirstUnreadMessageId: string | null;
  liveMessagesRef: React.MutableRefObject<Message[]>;
  isAtBottom: () => boolean;
}

/**
 * Manages thread read receipts: tracks unread count, marks thread as read
 * on scroll-to-bottom or after a timeout, and provides scroll-to-first-unread.
 */
export function useThreadReadReceipts({
  threadId,
  initialUnreadCount,
  initialFirstUnreadMessageId,
  liveMessagesRef,
  isAtBottom,
}: UseThreadReadReceiptsOptions) {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState(initialFirstUnreadMessageId);

  const unreadCountRef = useRef(initialUnreadCount);
  const isMarkingReadRef = useRef(false);

  useEffect(() => {
    unreadCountRef.current = unreadCount;
  }, [unreadCount]);

  const markThreadAsRead = useCallback(
    async (force: boolean = false) => {
      if (unreadCountRef.current <= 0) return;
      if (isMarkingReadRef.current) return;
      if (!force && !isAtBottom()) return;

      const latestId = liveMessagesRef.current[liveMessagesRef.current.length - 1]?.id ?? null;

      isMarkingReadRef.current = true;
      const result = await markThreadReadAction({ threadId, lastReadMessageId: latestId });
      isMarkingReadRef.current = false;

      if (result.error) return;

      setUnreadCount(0);
      setFirstUnreadMessageId(null);
    },
    [isAtBottom, threadId, liveMessagesRef]
  );

  // Auto-mark as read after 30s if there are unreads
  useEffect(() => {
    if (unreadCount <= 0) return;
    const timer = setTimeout(() => {
      void markThreadAsRead(true);
    }, 30_000);
    return () => clearTimeout(timer);
  }, [unreadCount, markThreadAsRead]);

  const scrollToFirstUnread = useCallback(() => {
    if (firstUnreadMessageId) {
      document
        .getElementById(`message-${firstUnreadMessageId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
  }, [firstUnreadMessageId]);

  return {
    unreadCount,
    setUnreadCount,
    firstUnreadMessageId,
    setFirstUnreadMessageId,
    markThreadAsRead,
    scrollToFirstUnread,
  };
}

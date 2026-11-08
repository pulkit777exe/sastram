'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { markThreadReadAction } from '@/modules/read-receipts/actions';
import type { Message } from '@/lib/types/index';

const AUTO_MARK_READ_DELAY_MS = 30_000;

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

  // Auto-mark as read after delay if there are unreads, but only while the
  // document is actually being viewed. If hidden when the timer fires, mark once
  // it becomes visible again.
  useEffect(() => {
    if (unreadCount <= 0) return;

    let visibilityHandler: (() => void) | null = null;
    const markIfVisible = () => {
      if (document.visibilityState === 'visible') {
        void markThreadAsRead(true);
      } else {
        visibilityHandler = () => {
          if (document.visibilityState === 'visible') {
            void markThreadAsRead(true);
            if (visibilityHandler) {
              document.removeEventListener('visibilitychange', visibilityHandler);
              visibilityHandler = null;
            }
          }
        };
        document.addEventListener('visibilitychange', visibilityHandler);
      }
    };

    const timer = setTimeout(markIfVisible, AUTO_MARK_READ_DELAY_MS);
    return () => {
      clearTimeout(timer);
      if (visibilityHandler) {
        document.removeEventListener('visibilitychange', visibilityHandler);
      }
    };
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

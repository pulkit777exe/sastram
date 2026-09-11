'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MessageSquare, AtSign, Bell, Reply, Pin, CheckCheck, Inbox } from 'lucide-react';
import TimeAgo from '@/components/ui/TimeAgo';
import { Button } from '@/components/ui/button';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/modules/notifications/actions';
import { useNotification } from '@/components/bootstrap-provider';
import { cn } from '@/lib/utils/cn';
import { toasts } from '@/lib/utils/toast';
import { isAiNotConfigured } from '@/lib/services/ai-sentinel';
import { AiNotConfiguredNotice } from '@/components/ui/ai-not-configured';
import { getNotificationDateGroup } from '@/lib/utils/format';
import { CollectionSaveButton } from '@/components/collections/CollectionSaveButton';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
  linkUrl: string | null;
  threadId: string | null;
  messageId: string | null;
}

interface NotificationListProps {
  notifications: NotificationItem[];
}

const TYPE_ICONS: Record<string, typeof Bell> = {
  MENTION: AtSign,
  REPLY: Reply,
  NEW_MESSAGE: MessageSquare,
  PINNED: Pin,
  DEFAULT: Bell,
};

export function NotificationList({ notifications: initial }: NotificationListProps) {
  const [notifications, setNotifications] = useState(initial);
  const [isPending, setIsPending] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initial.length >= 20);
  const router = useRouter();
  const { decrementNotificationCount, setNotificationCount } = useNotification();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const handleClick = async (notification: NotificationItem) => {
    if (!notification.isRead) {
      const result = await markNotificationRead({ notificationId: notification.id });
      if (!result.error) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n))
        );
        decrementNotificationCount();
      } else {
        toasts.serverError();
      }
    }
    if (notification.linkUrl) {
      router.push(notification.linkUrl);
    }
  };

  const handleMarkAllRead = async () => {
    setIsPending(true);
    const result = await markAllNotificationsRead();
    setIsPending(false);
    if (!result.error) {
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setNotificationCount(0);
      toasts.saved();
      return;
    }
    toasts.serverError();
  };

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) {
      return;
    }

    setIsLoadingMore(true);
    const result = await getNotifications({
      unreadOnly: false,
      limit: 20,
      offset: notifications.length,
    });
    setIsLoadingMore(false);

    if (result.error || !Array.isArray(result.data)) {
      toasts.error('Failed to load notifications.', 'Try refreshing.');
      return;
    }
    const data = result.data;

    if (data.length < 20) {
      setHasMore(false);
    }

    setNotifications((prev) => {
      const existingIds = new Set(prev.map((item) => item.id));
      const next = data
        .map((notification) => {
          const data =
            notification.data &&
            typeof notification.data === 'object' &&
            !Array.isArray(notification.data)
              ? (notification.data as Record<string, unknown>)
              : {};

          return {
            id: notification.id,
            type: notification.type,
            title: notification.title,
            message: notification.message ?? '',
            isRead: notification.isRead,
            createdAt: notification.createdAt,
            linkUrl: (data.linkUrl as string) ?? null,
            threadId: typeof data.threadId === 'string' ? (data.threadId as string) : null,
            messageId: typeof data.messageId === 'string' ? (data.messageId as string) : null,
          } as NotificationItem;
        })
        .filter((item) => !existingIds.has(item.id));

      return [...prev, ...next];
    });
  }, [hasMore, isLoadingMore, notifications.length]);

  useEffect(() => {
    const element = sentinelRef.current;
    if (!element || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: '240px' }
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  useEffect(() => {
    // Clear the unread badge when the notifications page is viewed, without
    // side-effecting a mark-all-read write on every mount (which previously
    // re-toasted serverError() on each navigation / StrictMode double-invoke).
    setNotificationCount(0);
  }, [setNotificationCount]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const groupedNotifications = useMemo(() => {
    const groups: Record<string, NotificationItem[]> = {
      Today: [],
      Yesterday: [],
      'This Week': [],
      Older: [],
    };
    for (const notification of notifications) {
      const bucket = getNotificationDateGroup(notification.createdAt);
      groups[bucket].push(notification);
    }
    return groups;
  }, [notifications]);

  // Extracted render helpers to avoid 150+ line JSX with 5+ branches
  function renderEmptyState() {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
          <Inbox size={24} className="text-ink-3" />
        </div>
        <p className="text-lg font-semibold text-ink">You&apos;re all caught up</p>
        <p className="text-sm text-ink-3 mt-1 max-w-sm">No notifications yet — we&apos;ll let you know when someone mentions you or replies.</p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/dashboard/threads">Browse threads</Link>
        </Button>
      </div>
    );
  }

  function renderUnreadHeader() {
    if (unreadCount <= 0) return null;
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-3">{unreadCount} unread</span>
        <Button type="button" variant="link" onClick={handleMarkAllRead} disabled={isPending} className="text-xs h-auto p-0 text-brand">
          <CheckCheck size={14} className="mr-1" />
          Mark all read
        </Button>
      </div>
    );
  }

  if (notifications.length === 0) return renderEmptyState();

  return (
    <div className="space-y-4">
      {renderUnreadHeader()}

      <div className="space-y-6">
        {Object.entries(groupedNotifications).map(([label, items]) => {
          if (items.length === 0) {
            return null;
          }

          return (
            <div key={label} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                {label}
              </h2>
              <div className="space-y-1">
                {items.map((notification) => {
                  const Icon = TYPE_ICONS[notification.type] ?? TYPE_ICONS.DEFAULT;
                  const isUnread = !notification.isRead;
                  const canSave = Boolean(notification.threadId || notification.messageId);
                  // Tailwind extracted — layout / color / interactivity grouped
                  const itemWrapperBase = 'group flex items-center gap-2 rounded-card border p-1 pr-2 transition-all hover:bg-hover hover:border-line';
                  const itemWrapperUnread = 'bg-brand/5 border-brand/10';
                  const itemWrapperRead = 'border-transparent';
                  const notificationBase = 'flex-1 flex items-start gap-3 p-3 rounded-control text-left justify-start h-auto hover:bg-transparent';
                  const iconBase = 'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full';
                  const iconUnread = 'bg-brand/10 text-brand';
                  const iconRead = 'bg-canvas border border-line text-ink-3';
                  return (
                    <div
                      key={notification.id}
                      className={cn(itemWrapperBase, isUnread ? itemWrapperUnread : itemWrapperRead)}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void handleClick(notification)}
                        className={notificationBase}
                      >
                        <div
                          className={cn(iconBase, isUnread ? iconUnread : iconRead)}
                        >
                          <Icon size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p
                              className={cn(
                                'text-sm truncate',
                                !notification.isRead
                                  ? 'font-semibold text-foreground'
                                  : 'text-foreground/80'
                              )}
                            >
                              {notification.title}
                            </p>
                            <span className="text-xs text-ink-3 shrink-0">
                              <TimeAgo date={notification.createdAt} />
                            </span>
                          </div>
                          <div className="text-xs text-ink-3 mt-0.5 line-clamp-2">
                            {isAiNotConfigured(notification.message) ? (
                              <AiNotConfiguredNotice className="border-0 bg-transparent p-0" />
                            ) : (
                              notification.message
                            )}
                          </div>
                        </div>
                        {!notification.isRead && (
                          <div className="mt-2 w-2 h-2 rounded-full bg-brand shrink-0" />
                        )}
                      </Button>
                      {canSave && (
                        <div className="shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                          <CollectionSaveButton threadId={notification.threadId ?? undefined} messageId={notification.messageId ?? undefined} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <div ref={sentinelRef} className="h-8 flex items-center justify-center">
          {isLoadingMore && <span className="text-xs text-ink-3">Loading more...</span>}
        </div>
      )}

      {!hasMore && notifications.length > 20 && (
        <div className="text-center text-xs text-ink-3 py-2">No more notifications</div>
      )}
    </div>
  );
}

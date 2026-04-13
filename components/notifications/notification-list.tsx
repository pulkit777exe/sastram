"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  AtSign,
  Heart,
  Bell,
  Reply,
  Pin,
  CheckCheck,
  Inbox,
} from "lucide-react";
import TimeAgo from "@/components/ui/TimeAgo";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/modules/notifications/actions";
import { useBootstrap } from "@/components/bootstrap-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { toasts } from "@/lib/utils/toast";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
  linkUrl: string | null;
}

interface NotificationListProps {
  notifications: NotificationItem[];
}

const TYPE_ICONS: Record<string, typeof Bell> = {
  MENTION: AtSign,
  REPLY: Reply,
  REACTION: Heart,
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
  const { decrementNotificationCount, setNotificationCount } = useBootstrap();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const handleClick = async (notification: NotificationItem) => {
    if (!notification.isRead) {
      const result = await markNotificationRead(notification.id);
      if (!result.error) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, isRead: true } : n,
          ),
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
      toasts.error("Failed to load notifications.", "Try refreshing.");
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
            typeof notification.data === "object" &&
            !Array.isArray(notification.data)
              ? (notification.data as Record<string, unknown>)
              : {};

          return {
            id: notification.id,
            type: notification.type,
            title: notification.title,
            message: notification.message ?? "",
            isRead: notification.isRead,
            createdAt: notification.createdAt,
            linkUrl: (data.linkUrl as string) ?? null,
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
      { rootMargin: "240px" },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  useEffect(() => {
    const previousCount = notifications.filter((n) => !n.isRead).length;
    setNotificationCount(0);

    void markAllNotificationsRead().then((result) => {
      if (result.error) {
        setNotificationCount(previousCount);
        toasts.serverError();
        return;
      }
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    });
    // Only run on first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groupedNotifications = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const groups: Record<string, NotificationItem[]> = {
      Today: [],
      Yesterday: [],
      "This Week": [],
      Older: [],
    };

    for (const notification of notifications) {
      const created = new Date(notification.createdAt);
      const createdDay = new Date(
        created.getFullYear(),
        created.getMonth(),
        created.getDate(),
      );

      if (createdDay.getTime() === today.getTime()) {
        groups.Today.push(notification);
      } else if (createdDay.getTime() === yesterday.getTime()) {
        groups.Yesterday.push(notification);
      } else if (createdDay >= weekAgo) {
        groups["This Week"].push(notification);
      } else {
        groups.Older.push(notification);
      }
    }

    return groups;
  }, [notifications]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
          <Inbox size={24} className="text-muted-foreground" />
        </div>
        <p className="text-lg font-semibold text-foreground">
          You&apos;re all caught up
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {unreadCount > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {unreadCount} unread
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={isPending}
            className="text-xs text-indigo-600 hover:text-indigo-700"
          >
            <CheckCheck size={14} className="mr-1" />
            Mark all read
          </Button>
        </div>
      )}

      <div className="space-y-6">
        {Object.entries(groupedNotifications).map(([label, items]) => {
          if (items.length === 0) {
            return null;
          }

          return (
            <div key={label} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
              </h2>
              <div className="space-y-1">
                {items.map((notification) => {
                  const Icon = TYPE_ICONS[notification.type] ?? TYPE_ICONS.DEFAULT;
                  return (
                    <button
                      key={notification.id}
                      onClick={() => void handleClick(notification)}
                      className={cn(
                        "w-full flex items-start gap-3 p-4 rounded-xl text-left transition-all hover:bg-muted/50",
                        !notification.isRead &&
                          "bg-indigo-500/5 border border-indigo-500/10",
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                          !notification.isRead
                            ? "bg-indigo-500/10 text-indigo-500"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <Icon size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={cn(
                              "text-sm truncate",
                              !notification.isRead
                                ? "font-semibold text-foreground"
                                : "text-foreground/80",
                            )}
                          >
                            {notification.title}
                          </p>
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            <TimeAgo date={notification.createdAt} />
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {notification.message}
                        </p>
                      </div>
                      {!notification.isRead && (
                        <div className="mt-2 w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <div ref={sentinelRef} className="h-8 flex items-center justify-center">
          {isLoadingMore && (
            <span className="text-xs text-muted-foreground">Loading more...</span>
          )}
        </div>
      )}

      {!hasMore && notifications.length > 20 && (
        <div className="text-center text-xs text-muted-foreground py-2">
          No more notifications
        </div>
      )}
    </div>
  );
}

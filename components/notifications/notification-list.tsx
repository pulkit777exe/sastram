"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  AtSign,
  Heart,
  Bell,
  Reply,
  Pin,
  CheckCheck,
} from "lucide-react";
import TimeAgo from "@/components/ui/TimeAgo";
import { markNotificationRead, markAllNotificationsRead } from "@/modules/notifications/actions";
import { useBootstrap } from "@/components/bootstrap-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

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
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { decrementNotificationCount, setNotificationCount } = useBootstrap();

  const handleClick = (notification: NotificationItem) => {
    if (!notification.isRead) {
      startTransition(async () => {
        const result = await markNotificationRead(notification.id);
        if (!result.error) {
          setNotifications((prev) =>
            prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n))
          );
          decrementNotificationCount();
        }
      });
    }
    if (notification.linkUrl) {
      router.push(notification.linkUrl);
    }
  };

  const handleMarkAllRead = () => {
    startTransition(async () => {
      const result = await markAllNotificationsRead();
      if (!result.error) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setNotificationCount(0);
      }
    });
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
          <Bell size={24} className="text-muted-foreground" />
        </div>
        <p className="text-lg font-semibold text-foreground">All caught up!</p>
        <p className="text-muted-foreground text-sm mt-1">
          No notifications right now.
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

      <div className="space-y-1">
        {notifications.map((notification) => {
          const Icon = TYPE_ICONS[notification.type] ?? TYPE_ICONS.DEFAULT;
          return (
            <button
              key={notification.id}
              onClick={() => handleClick(notification)}
              className={cn(
                "w-full flex items-start gap-3 p-4 rounded-xl text-left transition-all hover:bg-muted/50",
                !notification.isRead && "bg-indigo-500/5 border border-indigo-500/10"
              )}
            >
              <div
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  !notification.isRead
                    ? "bg-indigo-500/10 text-indigo-500"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <Icon size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn(
                    "text-sm truncate",
                    !notification.isRead ? "font-semibold text-foreground" : "text-foreground/80"
                  )}>
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
}

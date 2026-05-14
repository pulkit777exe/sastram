import { getSession } from '@/modules/auth/session';
import { getNotifications } from '@/modules/notifications/actions';
import { NotificationList } from '@/components/notifications/notification-list';
import { Bell } from 'lucide-react';

export default async function NotificationsPage() {
  const session = await getSession();

  if (!session?.user) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-zinc-500">
        <Bell size={48} className="text-zinc-800" />
        <p>Please log in to view your notifications.</p>
      </div>
    );
  }

  const result = await getNotifications({ unreadOnly: false, limit: 20, offset: 0 });
  const raw = result.data ?? [];

  const notifications = raw.map((notification) => {
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
    };
  });

  return (
    <div className="space-y-10 max-w-3xl">
      <div>
        <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-[0.2em] mb-2">
          <Bell size={14} />
          <span>Notifications</span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight">Notifications</h1>
        <p className="text-zinc-500 mt-2">Stay updated with mentions, replies, and activity.</p>
      </div>

      <NotificationList notifications={notifications} />
    </div>
  );
}

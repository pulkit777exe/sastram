import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getSession } from '@/modules/auth/session';
import { getNotifications } from '@/modules/notifications/actions';
import { NotificationList } from '@/components/notifications/notification-list';
import { Bell } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = {
  title: 'Notifications - Sastram',
  description: 'View your notifications and updates.',
};

function NotificationListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-6 w-24" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-3 w-12 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

async function NotificationListData() {
  const session = await getSession();
  if (!session?.user) return null;

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

  return <NotificationList notifications={notifications} />;
}

export default async function NotificationsPage() {
  const session = await getSession();

  if (!session?.user) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-muted-foreground">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <Bell size={20} className="text-muted-foreground" />
        </div>
        <p className="text-sm">Please log in to view your notifications.</p>
      </div>
    );
  }

  return (
    <div className="dashboard-page space-y-8 max-w-3xl animate-in fade-in duration-500">
      <div>
        <div className="page-eyebrow">
          <Bell size={14} />
          <span>Inbox</span>
        </div>
        <h1 className="text-3xl font-medium tracking-[-0.03em]">Notifications</h1>
        <p className="text-muted-foreground mt-2 text-sm">Stay updated with mentions, replies, and activity.</p>
      </div>

      <Suspense fallback={<NotificationListSkeleton />}>
        <NotificationListData />
      </Suspense>
    </div>
  );
}

import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getSession } from '@/modules/auth';
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
        <Skeleton className="h-6 w-24 rounded-control" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-4 rounded-card border border-line bg-canvas">
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

function extractNotificationData(rawData: unknown): Record<string, unknown> {
  if (rawData && typeof rawData === 'object' && !Array.isArray(rawData)) {
    return rawData as Record<string, unknown>;
  }
  return {};
}

function getNotificationLinkUrl(data: Record<string, unknown>): string | null {
  const linkUrl = data.linkUrl;
  if (typeof linkUrl === 'string') return linkUrl;
  return null;
}

function toNotificationViewModel(notification: {
  id: string;
  data: unknown;
  type: string;
  title: string;
  message?: string | null;
  isRead: boolean;
  createdAt: Date;
}) {
  const data = extractNotificationData(notification.data);
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message ?? '',
    isRead: notification.isRead,
    createdAt: notification.createdAt,
    linkUrl: getNotificationLinkUrl(data),
  };
}

async function NotificationListData() {
  const session = await getSession();
  if (!session?.user) return null;

  const result = await getNotifications({ unreadOnly: false, limit: 20, offset: 0 });
  const raw = result.data ?? [];

  const notifications = raw.map(toNotificationViewModel);

  return <NotificationList notifications={notifications} />;
}

export default async function NotificationsPage() {
  const session = await getSession();

  if (!session?.user) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-muted-foreground">
        <Bell size={48} className="text-foreground" />
        <p>Please log in to view your notifications.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif-heading text-2xl text-ink flex items-center gap-2">
          <Bell size={18} className="text-ink-3" /> Notifications
        </h1>
        <p className="text-sm text-ink-3 mt-1">Stay updated with mentions, replies, and activity.</p>
      </div>

      <div className="rounded-card border border-line bg-surface shadow-card p-4">
        <Suspense fallback={<NotificationListSkeleton />}>
          <NotificationListData />
        </Suspense>
      </div>
    </div>
  );
}

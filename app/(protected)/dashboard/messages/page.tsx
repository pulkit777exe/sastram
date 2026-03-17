import { getSession } from "@/modules/auth/session";
import { getNotifications } from "@/modules/notifications/actions";
import { NotificationList } from "@/components/notifications/notification-list";
import { Bell } from "lucide-react";


export default async function MessagesPage() {
  const session = await getSession();

  if (!session?.user) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-zinc-500">
        <Bell size={48} className="text-zinc-800" />
        <p>Please log in to view your notifications.</p>
      </div>
    );
  }

  const result = await getNotifications(false);
  const raw = result.data ?? [];

  const notifications = raw.map((n: {
    id: string;
    type: string;
    title: string;
    message: string | null;
    isRead: boolean;
    createdAt: Date;
    data: unknown;
  }) => {
    const data = (n.data && typeof n.data === "object" && !Array.isArray(n.data)) ? n.data as Record<string, unknown> : {};
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message ?? "",
      isRead: n.isRead,
      createdAt: n.createdAt,
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
        <h1 className="text-4xl font-bold tracking-tight">
          Notifications
        </h1>
        <p className="text-zinc-500 mt-2">
          Stay updated with mentions, replies, and activity.
        </p>
      </div>

      <NotificationList notifications={notifications} />
    </div>
  );
}

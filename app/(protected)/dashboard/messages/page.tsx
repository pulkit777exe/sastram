import { prisma } from "@/lib/infrastructure/prisma";
import { auth } from "@/lib/services/auth";
import { headers } from "next/headers";
import { MessageGrid } from "@/components/dashboard/message-grid";
import { Inbox } from "lucide-react";

export default async function MessagesPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-zinc-500">
        <Inbox size={48} className="text-zinc-800" />
        <p>Please log in to view your messages.</p>
      </div>
    );
  }

  const userMessages = await prisma.message.findMany({
    where: {
      senderId: session.user.id,
      deletedAt: null, // Only show non-deleted messages
    },
    include: {
      sender: { select: { name: true, image: true } },
      section: { select: { id: true, name: true, slug: true } },
      attachments: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="space-y-10 max-w-5xl">
      <div>
        <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-[0.2em] mb-2">
          <Inbox size={14} />
          <span>Personal Feed</span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight">
          Notifications
        </h1>
        <p className="text-zinc-500 mt-2">
          View of your account related notifications.
        </p>
      </div>

      <MessageGrid messages={userMessages} />
    </div>
  );
}

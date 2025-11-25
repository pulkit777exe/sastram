import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { MessageGrid } from "@/components/dashboard/message-grid";

export default async function MessagesPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return <div>Please log in to view your messages.</div>;
  }

  // fetch messages sent by the user
  const userMessages = await prisma.message.findMany({
    where: {
      senderId: session.user.id,
    },
    include: {
      sender: {
        select: {
          name: true,
          image: true,
        },
      },
      section: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      attachments: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Activity</h1>
        <p className="text-slate-500">
          Your recent contributions and discussions.
        </p>
      </div>

      <MessageGrid messages={userMessages} />
    </div>
  );
}

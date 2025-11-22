import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ChatArea } from "@/components/dashboard/chat-area";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Hash, Users } from "lucide-react";

interface TopicPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function TopicPage({ params }: TopicPageProps) {
  const { id } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return <div>Please log in to join the discussion.</div>;
  }

  const section = await prisma.section.findUnique({
    where: { id },
    include: {
      messages: {
        include: {
          sender: {
            select: {
              name: true,
              image: true,
            },
          },
          attachments: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      _count: {
        select: { messages: true },
      },
    },
  });

  if (!section) {
    notFound();
  }

  const uniqueSenders = new Set(section.messages.map((m) => m.senderId));

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Hash className="w-6 h-6 text-muted-foreground" />
            {section.name}
          </h1>
          {section.icon && <Badge variant="outline">{section.icon}</Badge>}
        </div>
        <p className="text-muted-foreground mb-4">{section.description}</p>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            {uniqueSenders.size} active participants
          </div>
          <div>{section._count.messages} messages</div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden border rounded-xl bg-slate-50/50">
        <ChatArea 
          initialMessages={section.messages} 
          sectionId={section.id}
          currentUser={{
            id: session.user.id,
            name: session.user.name,
            image: session.user.image ?? null,
          }}
        />
      </div>
    </div>
  );
}

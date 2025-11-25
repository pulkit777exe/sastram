import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChatArea } from "@/modules/chat/components/chat-area";
import { ThreadSubscribeButton } from "@/components/thread/subscribe-button";
import type { Message } from "@/lib/types";
import { requireSession, isAdmin } from "@/modules/auth/session";
import { getThreadBySlug } from "@/modules/threads/repository";
import { subscribeToThreadAction } from "@/modules/newsletter/actions";
import { isUserSubscribedToThread } from "@/modules/newsletter/repository";

interface ThreadPageProps {
  params: {
    slug: string;
  };
}

export default async function ThreadPage({ params }: ThreadPageProps) {
  const { slug } = await params; // Await params in Next.js 15+
  const session = await requireSession();
  const thread = await getThreadBySlug(slug);

  if (!thread) {
    notFound();
  }

  const subscribed = await isUserSubscribedToThread(thread.id, session.user.id);
  const subscribeAction = subscribeToThreadAction.bind(null, {
    threadId: thread.id,
    slug: thread.slug,
  });

  const messages: Message[] = thread.messages.map((message) => ({
    id: message.id,
    content: message.content,
    createdAt: message.createdAt,
    senderId: message.senderId,
    sender: {
      name: message.senderName,
      image: message.senderAvatar ?? null,
    },
    attachments: [],
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-[380px,1fr]">
      <div className="space-y-6">
        <Card className="rounded-3xl border-slate-100 bg-white shadow-sm">
          <CardHeader>
            <Badge variant="outline" className="rounded-full bg-slate-50 text-slate-600">
              {thread.community?.title || "Open Thread"}
            </Badge>
            <CardTitle className="mt-3 text-2xl font-semibold text-slate-900">
              {thread.title}
            </CardTitle>
            <p className="text-sm text-slate-500">{thread.description}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-4 rounded-2xl bg-slate-50/70 p-4 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <span>Active participants</span>
                <span className="font-semibold text-slate-900">{thread.activeUsers}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Messages logged</span>
                <span className="font-semibold text-slate-900">{thread.messageCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Subscribers</span>
                <span className="font-semibold text-slate-900">
                  {thread.subscriptionCount ?? 0}
                </span>
              </div>
            </dl>
            <form action={subscribeAction}>
              <ThreadSubscribeButton subscribed={subscribed} />
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-slate-100 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">AI digest</CardTitle>
            <p className="text-sm text-slate-500">
              Summaries arrive every 24h with the most relevant talking points.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            {thread.summary ? (
              <p className="leading-relaxed">{thread.summary}</p>
            ) : (
              <p className="text-slate-500">No digest available yet.</p>
            )}
            {isAdmin(session.user) && (
              <p className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">
                Admins can manage digests from the{" "}
                <a className="underline" href="/dashboard/admin">
                  admin workspace
                </a>
                .
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="rounded-[32px] border border-slate-100 bg-white shadow-lg">
        <ChatArea initialMessages={messages} sectionId={thread.id} currentUser={session.user} />
      </div>
    </div>
  );
}


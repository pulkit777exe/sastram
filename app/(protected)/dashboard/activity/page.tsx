import { getUserThreads, getUserMessages } from "@/modules/users/repository";
import { getSession } from "@/modules/auth/session";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import {
  Activity,
  MessageSquare,
  FileText,
  Users,
  Calendar,
  Reply,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

export default async function ActivityPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const [threadsResult, messagesResult] = await Promise.all([
    getUserThreads(session.user.id, 10, 0),
    getUserMessages(session.user.id, 20, 0),
  ]);

  const { threads } = threadsResult;
  const { messages } = messagesResult;

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-8">
        <Activity className="h-6 w-6 text-brand" />
        <h1 className="text-2xl font-bold">Your Activity</h1>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <section>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Threads Created</h2>
            <span className="text-sm text-muted-foreground">
              ({threadsResult.total})
            </span>
          </div>

          {threads.length === 0 ? (
            <Card className="p-8 text-center">
              <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">No threads created yet</p>
              <Link
                href="/dashboard/threads"
                className="text-brand text-sm mt-2 inline-block hover:underline"
              >
                Create your first thread
              </Link>
            </Card>
          ) : (
            <div className="space-y-3">
              {threads.map((thread) => (
                <Link
                  key={thread.id}
                  href={`/dashboard/threads/thread/${thread.slug}`}
                >
                  <Card className="p-4 hover:bg-accent transition-colors">
                    <h3 className="font-semibold text-foreground mb-1">
                      {thread.name}
                    </h3>
                    {thread.description && (
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-1">
                        {thread.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {thread.messageCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {thread.memberCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDistanceToNow(thread.createdAt, {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
              {threadsResult.hasMore && (
                <Link
                  href="/dashboard/threads?filter=mine"
                  className="block text-center text-sm text-brand hover:underline py-2"
                >
                  View all threads →
                </Link>
              )}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Your Comments</h2>
            <span className="text-sm text-muted-foreground">
              ({messagesResult.total})
            </span>
          </div>

          {messages.length === 0 ? (
            <Card className="p-8 text-center">
              <MessageSquare className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">No comments yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Join a thread and start the conversation
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <Link
                  key={message.id}
                  href={`/dashboard/threads/thread/${message.section.slug}`}
                >
                  <Card className="p-4 hover:bg-accent transition-colors">
                    {message.parent && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2 pb-2 border-b border-border">
                        <Reply className="h-3 w-3" />
                        <span>
                          Replying to{" "}
                          <span className="font-medium">
                            {message.parent.sender?.name || "Unknown"}
                          </span>
                        </span>
                      </div>
                    )}

                    <p className="text-sm text-foreground line-clamp-2 mb-2">
                      {message.content}
                    </p>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium text-brand">
                        {message.section.name}
                      </span>
                      <span>
                        {formatDistanceToNow(message.createdAt, {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
              {messagesResult.hasMore && (
                <button className="block w-full text-center text-sm text-brand hover:underline py-2">
                  Load more comments
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

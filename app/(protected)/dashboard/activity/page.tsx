import { getUserThreads, getUserMessages } from '@/modules/users';
import { getSession } from '@/modules/auth';
import { redirect } from 'next/navigation';
import { Activity, MessageSquare, FileText, Users, Calendar, Reply, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import TimeAgo from '@/components/ui/TimeAgo';
import { ROUTES } from '@/lib/config/routes';

export default async function ActivityPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const [threadsResult, messagesResult] = await Promise.all([
    getUserThreads(session.user.id, 10, 0),
    getUserMessages(session.user.id, 20, 0),
  ]);

  const { threads } = threadsResult;
  const { messages } = messagesResult;

  return (
    <div className="dashboard-page space-y-8 animate-in fade-in duration-500">
      <div className="page-heading">
        <p className="page-eyebrow"><Activity className="h-3.5 w-3.5" /> Activity</p>
        <h1>Your activity</h1>
        <p>Keep track of the discussions and replies you've contributed.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <section>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Threads Created</h2>
            <span className="text-xs text-muted-foreground">({threadsResult.total})</span>
          </div>

          {threads.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <FileText size={16} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">No threads created yet</p>
              <Link
                href="/dashboard/threads"
                className="text-xs text-brand mt-2 inline-block hover:underline"
              >
                Create your first thread
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {threads.map((thread) => (
                <Link key={thread.id} href={ROUTES.THREAD(thread.slug)}>
                  <div className="group rounded-xl border border-border bg-card p-4 hover:bg-accent transition-all hover:shadow-linear-sm cursor-pointer">
                    <h3 className="font-semibold text-foreground mb-1 group-hover:text-brand transition-colors">{thread.name}</h3>
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
                        <TimeAgo date={thread.createdAt} />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
              {threadsResult.hasMore && (
                <Link
                  href="/dashboard/threads?filter=mine"
                  className="flex items-center justify-center gap-1 text-xs text-brand hover:underline py-2"
                >
                  View all threads <ArrowRight size={12} />
                </Link>
              )}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Your Comments</h2>
            <span className="text-xs text-muted-foreground">({messagesResult.total})</span>
          </div>

          {messages.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <MessageSquare size={16} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">No comments yet</p>
              <p className="text-xs text-muted-foreground">
                Join a thread and start the conversation.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map((message) => (
                <Link key={message.id} href={ROUTES.THREAD(message.thread.slug)}>
                  <div className="group rounded-xl border border-border bg-card p-4 hover:bg-accent transition-all hover:shadow-linear-sm cursor-pointer">
                    {message.parent && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2 pb-2 border-b border-border">
                        <Reply className="h-3 w-3" />
                        <span>
                          Replying to{' '}
                          <span className="font-medium">
                            {message.parent.sender?.name || 'Unknown'}
                          </span>
                        </span>
                      </div>
                    )}

                    <p className="text-sm text-foreground line-clamp-2 mb-2">{message.content}</p>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium text-brand">{message.thread.name}</span>
                      <span>
                        <TimeAgo date={message.createdAt} />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
              {messagesResult.hasMore && (
                <button className="flex items-center justify-center gap-1 w-full text-xs text-brand hover:underline py-2">
                  Load more comments <ArrowRight size={12} />
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

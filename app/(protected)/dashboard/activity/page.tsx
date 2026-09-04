import { getUserThreads, getUserMessages } from '@/modules/users';
import { getSession } from '@/modules/auth';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, MessageSquare, FileText, Users, Calendar, Reply } from 'lucide-react';
import Link from 'next/link';
import TimeAgo from '@/components/ui/TimeAgo';
import { ROUTES } from '@/lib/config/routes';

const THREADS_PAGE_SIZE = 10;
const MESSAGES_PAGE_SIZE = 20;

function getReplySenderName(sender: { name?: string | null } | null | undefined): string {
  if (sender?.name) return sender.name;
  return 'Unknown';
}

export default async function ActivityPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const [threadsResult, messagesResult] = await Promise.all([
    getUserThreads(session.user.id, THREADS_PAGE_SIZE, 0),
    getUserMessages(session.user.id, MESSAGES_PAGE_SIZE, 0),
  ]);

  const { threads } = threadsResult;
  const { messages } = messagesResult;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Activity className="h-6 w-6 text-brand" />
        <h1 className="text-2xl font-bold text-ink">Your Activity</h1>
    </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <section>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-5 w-5 text-ink-3" />
            <h2 className="text-lg font-semibold text-ink">Threads Created</h2>
            <span className="text-sm text-ink-3">({threadsResult.total})</span>
          </div>

          {threads.length === 0 ? (
            <Card className="p-8 text-center">
              <FileText className="h-10 w-10 mx-auto mb-3 text-ink-3 opacity-50" />
              <p className="text-ink-3">No threads created yet</p>
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
                <Link key={thread.id} href={ROUTES.THREAD(thread.slug)}>
                  <Card className="p-4 hover:bg-hover transition-colors">
                    <h3 className="font-semibold text-ink mb-1">{thread.name}</h3>
                    {thread.description && (
                      <p className="text-sm text-ink-3 mb-2 line-clamp-1">
                        {thread.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-ink-3">
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
            <MessageSquare className="h-5 w-5 text-ink-3" />
            <h2 className="text-lg font-semibold text-ink">Your Comments</h2>
            <span className="text-sm text-ink-3">({messagesResult.total})</span>
          </div>

          {messages.length === 0 ? (
            <Card className="p-8 text-center">
              <MessageSquare className="h-10 w-10 mx-auto mb-3 text-ink-3 opacity-50" />
              <p className="text-ink-3">No comments yet</p>
              <p className="text-sm text-ink-3 mt-1">
                Join a thread and start the conversation
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <Link key={message.id} href={ROUTES.THREAD(message.thread.slug)}>
                  <Card className="p-4 hover:bg-hover transition-colors">
                    {message.parent && (
                      <div className="flex items-center gap-2 text-xs text-ink-3 mb-2 pb-2 border-b border-line">
                        <Reply className="h-3 w-3" />
                        <span>
                          Replying to{' '}
                          <span className="font-medium">
                            {getReplySenderName(message.parent.sender)}
                          </span>
                        </span>
                      </div>
                    )}

                    <p className="text-sm text-ink line-clamp-2 mb-2">{message.content}</p>

                    <div className="flex items-center justify-between text-xs text-ink-3">
                      <span className="font-medium text-brand">{message.thread.name}</span>
                      <span>
                        <TimeAgo date={message.createdAt} />
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
              {messagesResult.hasMore && (
                <Button type="button" variant="link" className="w-full">
                  Load more comments
                </Button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

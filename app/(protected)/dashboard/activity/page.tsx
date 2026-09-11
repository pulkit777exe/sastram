import { getUserThreads, getUserMessages } from '@/modules/users';
import { getSession } from '@/modules/auth';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, MessageSquare, FileText, Users, Calendar, Reply } from 'lucide-react';
import Link from 'next/link';
import TimeAgo from '@/components/ui/TimeAgo';
import { ROUTES } from '@/lib/config/routes';
import { CollectionSaveButton } from '@/components/collections/CollectionSaveButton';

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
        <h1 className="font-serif-heading text-2xl text-ink">Your Activity</h1>
    </div>

      <div className="grid lg:grid-cols-2 gap-10">
        <section className="space-y-5">
          <div className="flex items-center gap-2.5 pb-3 border-b border-line/60">
            <div className="w-8 h-8 rounded-control bg-brand/10 flex items-center justify-center">
              <FileText className="h-4 w-4 text-brand" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink leading-none">Threads Created</h2>
              <span className="text-xs text-ink-3">({threadsResult.total}) total</span>
            </div>
          </div>

          {threads.length === 0 ? (
            <Card className="p-10 text-center flex flex-col items-center border-dashed shadow-none">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
                <FileText size={22} className="text-muted-foreground" />
              </div>
              <p className="text-lg font-semibold text-ink">No threads yet</p>
              <p className="text-sm text-ink-3 mt-1 max-w-sm">Create a thread to start a discussion — @sai will help track it.</p>
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link href="/dashboard/threads">Create thread</Link>
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {threads.map((thread) => (
                <div key={thread.id} className="group flex items-center gap-3 rounded-card border border-line bg-surface p-4 hover:bg-hover hover:border-line-strong hover:shadow-card transition-all duration-200">
                  <Link href={ROUTES.THREAD(thread.slug)} prefetch={false} className="flex-1 min-w-0">
                    <h3 className="font-semibold text-ink mb-1.5 line-clamp-1 group-hover:text-brand transition-colors">{thread.name}</h3>
                    {thread.description && (
                      <p className="text-sm text-ink-3 mb-3 line-clamp-2 leading-relaxed">
                        {thread.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-ink-3 pt-3 border-t border-line/50">
                      <span className="flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5" />
                        {thread.messageCount}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        {thread.memberCount}
                      </span>
                      <span className="flex items-center gap-1.5 ml-auto">
                        <Calendar className="h-3.5 w-3.5" />
                        <TimeAgo date={thread.createdAt} />
                      </span>
                    </div>
                  </Link>
                  <div className="shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <CollectionSaveButton threadId={thread.id} />
                  </div>
                </div>
              ))}
              {threadsResult.hasMore && (
                <Link
                  href="/dashboard/threads?filter=mine"
                  className="block text-center text-sm font-medium text-brand hover:text-brand/80 hover:underline py-3 rounded-card border border-dashed border-line bg-surface/50"
                >
                  View all threads →
                </Link>
              )}
            </div>
          )}
        </section>

        <section className="space-y-5">
          <div className="flex items-center gap-2.5 pb-3 border-b border-line/60">
            <div className="w-8 h-8 rounded-control bg-violet-500/10 flex items-center justify-center">
              <MessageSquare className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink leading-none">Your Comments</h2>
              <span className="text-xs text-ink-3">({messagesResult.total}) total</span>
            </div>
          </div>

          {messages.length === 0 ? (
            <Card className="p-10 text-center flex flex-col items-center border-dashed shadow-none">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
                <MessageSquare size={22} className="text-muted-foreground" />
              </div>
              <p className="text-lg font-semibold text-ink">No comments yet</p>
              <p className="text-sm text-ink-3 mt-1 max-w-sm">Join a thread and start the conversation.</p>
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link href="/dashboard/threads">Browse threads</Link>
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div key={message.id} className="group flex items-center gap-3 rounded-card border border-line bg-surface p-4 hover:bg-hover hover:border-line-strong hover:shadow-card transition-all duration-200">
                  <Link href={ROUTES.THREAD(message.thread.slug)} prefetch={false} className="flex-1 min-w-0">
                    {message.parent && (
                      <div className="flex items-center gap-2 text-xs text-ink-3 mb-2">
                        <Reply className="h-3.5 w-3.5" />
                        <span>
                          Replying to{' '}
                          <span className="font-medium text-ink">
                            {getReplySenderName(message.parent.sender)}
                          </span>
                        </span>
                      </div>
                    )}
                    <p className="text-sm text-ink line-clamp-2 mb-2 leading-relaxed group-hover:text-brand transition-colors">{message.content}</p>
                    <div className="flex items-center justify-between text-xs text-ink-3">
                      <span className="font-medium text-brand truncate pr-2">{message.thread.name}</span>
                      <span className="shrink-0 flex items-center gap-1">
                        <Calendar size={12} />
                        <TimeAgo date={message.createdAt} />
                      </span>
                    </div>
                  </Link>
                  <div className="shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <CollectionSaveButton messageId={message.id} />
                  </div>
                </div>
              ))}
              {messagesResult.hasMore && (
                <p className="text-xs text-center text-ink-3 py-3 rounded-card border border-dashed border-line bg-surface/50">Showing 20 most recent · <Link href="/dashboard/threads" className="text-brand hover:underline font-medium">Browse threads</Link> to see more</p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

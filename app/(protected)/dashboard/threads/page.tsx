import { getSession } from '@/modules/auth/session';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { FileText, MessageSquare, Users, Calendar, Search } from 'lucide-react';
import Link from 'next/link';
import TimeAgo from '@/components/ui/TimeAgo';
import { searchThreads } from '@/modules/search/repository';
import { listThreads } from '@/modules/threads/repository';
import { listCommunities } from '@/modules/communities/repository';
import { ROUTES } from '@/lib/config/routes';
import { CreateThreadDialog } from '@/components/create-thread-dialog';

export default async function ThreadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const { q } = await searchParams;
  const communities = await listCommunities();

  if (q && q.trim()) {
    const result = await searchThreads(q.trim(), 50, 0);
    const { threads } = result;

    return (
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Search className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Search Results</h1>
            <span className="text-muted-foreground">
              &ldquo;{q}&rdquo; ({threads.length})
            </span>
          </div>
          <CreateThreadDialog communities={communities.map(c => ({ id: c.id, title: c.title }))} />
        </div>

        {threads.length === 0 ? (
          <Card className="p-12 text-center">
            <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No threads found</p>
            <p className="text-sm text-muted-foreground mt-2">
              Try different search terms
            </p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {threads.map((thread) => (
              <Link key={thread.id} href={ROUTES.THREAD(thread.slug)}>
                <Card className="p-4 hover:bg-accent transition-colors">
                  <h3 className="font-semibold text-foreground mb-2">{thread.name}</h3>
                  {thread.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {thread.description}
                    </p>
                  )}
                  {thread.aiSummary && (
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-1 italic">
                      {thread.aiSummary as string}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {thread.messageCount ?? 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {thread.memberCount ?? 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <TimeAgo date={thread.createdAt} />
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  const paginatedResult = await listThreads({ pageSize: 50 });
  const { threads } = paginatedResult;

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Threads</h1>
          <span className="text-muted-foreground">({paginatedResult.pagination.totalItems})</span>
        </div>
        <CreateThreadDialog communities={communities.map(c => ({ id: c.id, title: c.title }))} />
      </div>

      {threads.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">No threads yet</p>
          <p className="text-sm text-muted-foreground mt-2">
            Threads will appear here once they are created
          </p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {threads.map((thread) => (
            <Link key={thread.id} href={ROUTES.THREAD(thread.slug)}>
              <Card className="p-4 hover:bg-accent transition-colors">
                <h3 className="font-semibold text-foreground mb-2">{thread.name}</h3>
                {thread.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
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
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

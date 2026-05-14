import { getBookmarkedThreads } from '@/modules/bookmarks/actions';
import { getSession } from '@/modules/auth/session';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Bookmark, MessageSquare, Users, Calendar } from 'lucide-react';
import Link from 'next/link';
import TimeAgo from '@/components/ui/TimeAgo';
import type { BookmarkedThreadsResponse } from '@/modules/bookmarks/types';

export default async function BookmarksPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const result = await getBookmarkedThreads(50, 0);

  if (result.error || !result.data) {
    return (
      <div className="container mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold mb-6">Bookmarks</h1>
        <Card className="p-6 text-center text-muted-foreground">
          {result.error || 'Failed to load bookmarks'}
        </Card>
      </div>
    );
  }

  const { bookmarks } = result.data as BookmarkedThreadsResponse;

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-6">
        <Bookmark className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Bookmarks</h1>
        <span className="text-muted-foreground">({bookmarks.length})</span>
      </div>

      {bookmarks.length === 0 ? (
        <Card className="p-12 text-center">
          <Bookmark className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">No bookmarks yet</p>
          <p className="text-sm text-muted-foreground mt-2">
            Bookmark threads to find them easily later
          </p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {bookmarks.map((thread) => (
            <Link key={thread.id} href={`/dashboard/threads/thread/${thread.slug}`}>
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

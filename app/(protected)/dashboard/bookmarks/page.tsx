import { getBookmarkedThreads } from '@/modules/bookmarks/actions';
import { getSession } from '@/modules/auth';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Bookmark, MessageSquare, Users, Calendar } from 'lucide-react';
import Link from 'next/link';
import TimeAgo from '@/components/ui/TimeAgo';
import type { BookmarkedThreadsResponse } from '@/modules/bookmarks/types';
import { ROUTES } from '@/lib/config/routes';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bookmarks - Sastram',
  description: 'Your saved and bookmarked threads.',
};

const BOOKMARKS_PAGE_SIZE = 50;

export default async function BookmarksPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const result = await getBookmarkedThreads({ limit: BOOKMARKS_PAGE_SIZE, offset: 0 });

  if (result.error || !result.data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-ink">Bookmarks</h1>
        <Card className="p-6 text-center text-ink-3">
          {result.error || 'Failed to load bookmarks'}
       </Card>
     </div>
    );
  }

  const { bookmarks } = result.data as BookmarkedThreadsResponse;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bookmark className="h-6 w-6 text-ink" />
        <h1 className="text-2xl font-bold text-ink">Bookmarks</h1>
        <span className="text-ink-3">({bookmarks.length})</span>
     </div>

      {bookmarks.length === 0 ? (
        <Card className="p-6 md:p-12 text-center">
          <Bookmark className="h-12 w-12 mx-auto mb-4 text-ink-3 opacity-50" />
          <p className="text-ink-3">No bookmarks yet</p>
          <p className="text-sm text-ink-3 mt-2">
            Bookmark threads to find them easily later
          </p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {bookmarks.map((thread) => (
            <Link key={thread.id} href={ROUTES.THREAD(thread.slug)}>
              <Card className="p-4 hover:bg-hover transition-colors">
                <h3 className="font-semibold text-ink mb-2">{thread.name}</h3>
                {thread.description && (
                  <p className="text-sm text-ink-3 mb-3 line-clamp-2">
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
        </div>
      )}
    </div>
  );
}

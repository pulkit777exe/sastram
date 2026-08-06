import { getBookmarkedThreads } from '@/modules/bookmarks/actions';
import { getSession } from '@/modules/auth/session';
import { redirect } from 'next/navigation';
import { Bookmark, MessageSquare, Users, Calendar, Sparkles } from 'lucide-react';
import Link from 'next/link';
import TimeAgo from '@/components/ui/TimeAgo';
import type { BookmarkedThreadsResponse } from '@/modules/bookmarks/types';
import { ROUTES } from '@/lib/config/routes';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bookmarks - Sastram',
  description: 'Your saved and bookmarked threads.',
};

export default async function BookmarksPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const result = await getBookmarkedThreads({ limit: 50, offset: 0 });

  if (result.error || !result.data) {
    return (
      <div className="dashboard-page space-y-8 animate-in fade-in duration-500">
        <div className="page-heading">
          <p className="page-eyebrow"><Bookmark className="h-3.5 w-3.5" /> Library</p>
          <h1>Bookmarks</h1>
          <p>Threads you saved for later.</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {result.error || 'Failed to load bookmarks'}
          </p>
        </div>
      </div>
    );
  }

  const { bookmarks } = result.data as BookmarkedThreadsResponse;

  return (
    <div className="dashboard-page space-y-8 animate-in fade-in duration-500">
      <div className="page-heading">
        <p className="page-eyebrow"><Bookmark className="h-3.5 w-3.5" /> Library</p>
        <h1>Bookmarks <span className="text-muted-foreground">({bookmarks.length})</span></h1>
        <p>Threads you saved for later.</p>
      </div>

      {bookmarks.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Bookmark size={20} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">No bookmarks yet</p>
          <p className="text-xs text-muted-foreground">
            Bookmark threads to find them easily later.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {bookmarks.map((thread) => (
            <Link key={thread.id} href={ROUTES.THREAD(thread.slug)}>
              <div className="group rounded-xl border border-border bg-card p-4 hover:bg-accent transition-all hover:shadow-linear-sm cursor-pointer">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand/15 bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-primary-foreground">
                    <Sparkles size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground mb-1 group-hover:text-brand transition-colors">
                      {thread.name}
                    </h3>
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
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

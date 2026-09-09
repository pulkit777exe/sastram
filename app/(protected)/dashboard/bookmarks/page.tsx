import { getBookmarkedThreads } from '@/modules/bookmarks/actions';
import { getSession } from '@/modules/auth';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Bookmark } from 'lucide-react';
import type { BookmarkedThreadsResponse } from '@/modules/bookmarks/types';
import { BookmarksFilter } from '@/components/bookmarks/BookmarksFilter';
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
        <h1 className="font-serif-heading text-2xl text-ink">Bookmarks</h1>
        <Card className="p-6 text-center text-ink-3 border border-line">
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
        <h1 className="font-serif-heading text-2xl text-ink">Bookmarks</h1>
        <span className="text-ink-3">({bookmarks.length})</span>
     </div>

      <BookmarksFilter bookmarks={bookmarks as unknown as { id: string; slug: string; name: string; description: string | null; messageCount: number; memberCount: number; createdAt: Date }[]} />
    </div>
  );
}

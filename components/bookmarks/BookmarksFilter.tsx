'use client';

import React from 'react';
import Link from 'next/link';
import { Bookmark, Search, X, MessageSquare, Users, Calendar } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import TimeAgo from '@/components/ui/TimeAgo';
import { ROUTES } from '@/lib/config/routes';

type Thread = { id: string; slug: string; name: string; description: string | null; messageCount: number; memberCount: number; createdAt: Date | string };

export function BookmarksFilter({ bookmarks }: { bookmarks: Thread[] }) {
  const [query, setQuery] = React.useState('');
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bookmarks;
    return bookmarks.filter((t) => `${t.name} ${t.description ?? ''}`.toLowerCase().includes(q));
  }, [bookmarks, query]);

  if (bookmarks.length === 0) {
    return (
      <Card className="p-8 md:p-12 text-center flex flex-col items-center border-dashed shadow-none">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
          <Bookmark size={22} className="text-muted-foreground" />
        </div>
        <p className="text-lg font-semibold text-ink">No bookmarks yet</p>
        <p className="text-sm text-ink-3 mt-1 max-w-sm">Bookmark threads to find them easily later.</p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/dashboard/threads">Browse threads</Link>
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <Input aria-label="Filter bookmarks" placeholder="Filter bookmarks…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8 h-8 text-sm" />
          {query && <button aria-label="Clear filter" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"><X size={14}/></button>}
        </div>
        <span className="text-xs text-ink-3">{filtered.length} of {bookmarks.length}{query ? ` for “${query}”` : ''}</span>
      </div>
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-center rounded-card border border-dashed border-line bg-surface">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center mb-2">
            <Search size={16} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-ink">No matches for “{query}”</p>
          <p className="text-xs text-ink-3 mt-1">Try a different keyword</p>
          <Button variant="outline" size="sm" className="mt-3 h-7 text-xs rounded-full" onClick={() => setQuery('')}>Clear filter</Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((thread) => (
            <Link key={thread.id} href={ROUTES.THREAD(thread.slug)}>
              <Card className="p-4 hover:bg-hover transition-colors rounded-card border border-line shadow-card">
                <h3 className="font-semibold text-ink mb-2">{thread.name}</h3>
                {thread.description && <p className="text-sm text-ink-3 mb-3 line-clamp-2">{thread.description}</p>}
                <div className="flex items-center gap-4 text-xs text-ink-3">
                  <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{thread.messageCount}</span>
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{thread.memberCount}</span>
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /><TimeAgo date={thread.createdAt as unknown as Date} /></span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

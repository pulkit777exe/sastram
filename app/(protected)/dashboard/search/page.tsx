'use client';

import { useState } from 'react';
import { Search, MessageSquare, Users, FileText, Loader2, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/lib/config/routes';
import { clientLogger } from '@/lib/utils/client-logger';
import { toasts } from '@/lib/utils/toast';
import {
  searchThreadsAction,
  searchMessagesAction,
  searchUsersAction,
} from '@/modules/search/actions';
import Link from 'next/link';
import type { SearchThreadResult, SearchMessageResult, SearchUserResult } from '@/modules/search/types';

type SearchType = 'all' | 'threads' | 'messages' | 'users';

interface SearchResults {
  threads: { threads: SearchThreadResult[]; total: number; hasMore: boolean } | null;
  messages: { messages: SearchMessageResult[]; total: number; hasMore: boolean } | null;
  users: { users: SearchUserResult[]; total: number; hasMore: boolean } | null;
}

function SearchSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-5 w-32" />
          <div className="grid gap-3">
            <Skeleton className="h-20 w-full rounded-card" />
            <Skeleton className="h-20 w-full rounded-card" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<SearchType>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) {
      toasts.error('Enter a search query');
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    try {
      const nextResults: SearchResults = { threads: null, messages: null, users: null };
      const tasks: Promise<void>[] = [];

      if (searchType === 'all' || searchType === 'threads') {
        tasks.push(
          searchThreadsAction({ query }).then((res) => {
            if (res.error) throw new Error(res.error);
            nextResults.threads = (res.data as SearchResults['threads']) || null;
          })
        );
      }
      if (searchType === 'all' || searchType === 'messages') {
        tasks.push(
          searchMessagesAction({ query }).then((res) => {
            if (res.error) throw new Error(res.error);
            nextResults.messages = (res.data as SearchResults['messages']) || null;
          })
        );
      }
      if (searchType === 'all' || searchType === 'users') {
        tasks.push(
          searchUsersAction({ query }).then((res) => {
            if (res.error) throw new Error(res.error);
            nextResults.users = (res.data as SearchResults['users']) || null;
          })
        );
      }

      await Promise.all(tasks);
      setResults(nextResults);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Search failed. Please try again.';
      clientLogger.error('Search error', msg);
      setSearchError(msg);
      toasts.error(msg);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 md:px-6">
      <div className="flex items-center gap-3">
        <Search className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Search</h1>
    </div>

        <Card className="p-6 space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search threads, messages, or users..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button type="button" onClick={handleSearch} disabled={isSearching}>
              {isSearching ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-2 inline" />
                  Searching...
                </>
              ) : (
                'Search'
              )}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {(['all', 'threads', 'messages', 'users'] as SearchType[]).map((type) => (
              <Button variant={searchType === type ? 'default' : 'outline'} size="sm"
                key={type}
                onClick={() => setSearchType(type)}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Button>
            ))}
          </div>
        </Card>

        {isSearching && <SearchSkeleton />}

        {searchError && !isSearching && (
          <Card className="p-6 text-center border-destructive/30 bg-destructive/5">
            <p className="text-sm font-medium text-destructive">{searchError}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={handleSearch}>
              Try again
            </Button>
          </Card>
        )}

        {results && !isSearching && !searchError && (
          <div
            className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300 fill-mode-both"
          >
            {(() => {
              const hasAny =
                (results.threads?.total ?? 0) > 0 ||
                (results.messages?.total ?? 0) > 0 ||
                (results.users?.total ?? 0) > 0;
              if (!hasAny) {
                return (
                  <Card className="p-8 md:p-12 text-center flex flex-col items-center border-dashed">
                    <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
                      <SearchX size={22} className="text-muted-foreground" />
                    </div>
                    <p className="text-lg font-semibold text-ink">No results for &ldquo;{query}&rdquo;</p>
                    <p className="text-sm text-ink-3 mt-1 max-w-sm">Try a different keyword or switch the filter above. You can also browse all threads.</p>
                    <div className="flex gap-2 mt-4">
                      <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                        Clear search
                      </Button>
                      <Button asChild variant="default" size="sm">
                        <Link href="/dashboard/threads">Browse threads</Link>
                      </Button>
                    </div>
                  </Card>
                );
              }
              return null;
            })()}
            {results.threads && results.threads.total > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Threads ({results.threads.total || 0})
                </h2>
                <div className="grid gap-4">
                  {results.threads.threads?.map((thread) => (
                    <Link key={thread.id} href={ROUTES.THREAD(thread.slug)}>
                      <Card className="p-4 hover:bg-accent transition-colors">
                        <h3 className="font-semibold">{thread.name}</h3>
                        {thread.description && (
                          <p className="text-sm text-muted-foreground mt-1">{thread.description}</p>
                        )}
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {results.messages && results.messages.total > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Messages ({results.messages.total || 0})
                </h2>
                <div className="grid gap-4">
                  {results.messages.messages?.map((message) => (
                    <Link
                      key={message.id}
                      href={ROUTES.THREAD(message.thread.slug)}
                    >
                      <Card className="p-4 hover:bg-accent transition-colors">
                        <p className="text-sm">{message.content}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          by {message.sender.name || 'Unknown'} in {message.thread.name}
                        </p>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {results.users && results.users.total > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Users ({results.users.total || 0})
                </h2>
                <div className="grid gap-4">
                  {results.users.users?.map((user) => (
                    <Link key={user.id} href={`/user/${user.id}`}>
                      <Card className="p-4 hover:bg-accent transition-colors">
                        <h3 className="font-semibold">{user.name || 'Unknown'}</h3>
                        {user.bio && (
                          <p className="text-sm text-muted-foreground mt-1">{user.bio}</p>
                        )}
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
   </div>
  );
}

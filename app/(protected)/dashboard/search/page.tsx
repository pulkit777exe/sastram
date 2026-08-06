'use client';

import { useState } from 'react';
import { Search, MessageSquare, Users, FileText, ArrowRight } from 'lucide-react';
import { ROUTES } from '@/lib/config/routes';
import { clientLogger } from '@/lib/utils/client-logger';
import {
  searchThreadsAction,
  searchMessagesAction,
  searchUsersAction,
} from '@/modules/search/actions';
import Link from 'next/link';
import type { SearchThreadResult, SearchMessageResult, SearchUserResult } from '@/modules/search/types';
import { SegmentedControl } from '@/components/interior/segmented-control';
import { Ripple } from '@/components/interior/ripple';

type SearchType = 'all' | 'threads' | 'messages' | 'users';

interface SearchResults {
  threads: { threads: SearchThreadResult[]; total: number; hasMore: boolean } | null;
  messages: { messages: SearchMessageResult[]; total: number; hasMore: boolean } | null;
  users: { users: SearchUserResult[]; total: number; hasMore: boolean } | null;
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<SearchType>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      const promises: Promise<{ data: unknown; error: unknown; ok?: boolean }>[] = [];

      if (searchType === 'all' || searchType === 'threads') {
        promises.push(searchThreadsAction(query));
      }
      if (searchType === 'all' || searchType === 'messages') {
        promises.push(searchMessagesAction(query));
      }
      if (searchType === 'all' || searchType === 'users') {
        promises.push(searchUsersAction(query));
      }

      const searchResults = await Promise.all(promises);
      setResults({
        threads: (searchResults[0]?.data as SearchResults['threads']) || null,
        messages: (searchResults[1]?.data as SearchResults['messages']) || null,
        users: (searchResults[2]?.data as SearchResults['users']) || null,
      });
    } catch (error) {
      clientLogger.error('Search error', error instanceof Error ? error.message : String(error));
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="dashboard-page mx-auto w-full max-w-4xl space-y-8 px-4 md:px-6 animate-in fade-in duration-500">
      <div className="page-heading">
        <p className="page-eyebrow"><Search className="h-3.5 w-3.5" /> Workspace</p>
        <h1>Search</h1>
        <p>Find threads, messages, and people across your workspace.</p>
      </div>

      {/* Search input */}
      <div className="relative bg-card border border-border rounded-2xl shadow-linear-sm hover:shadow-linear-md focus-within:shadow-linear-lg focus-within:border-foreground/20 transition-all duration-300">
        <div className="flex items-center gap-3 px-4 py-3">
          <Search size={16} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Search threads, messages, or users..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground text-sm"
          />
          <Ripple
            onPress={handleSearch}
            disabled={isSearching || !query.trim()}
            className="px-4 py-1.5 text-sm font-medium bg-foreground text-background rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </Ripple>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex justify-center">
        <SegmentedControl
          options={[
            { value: 'all', label: 'All' },
            { value: 'threads', label: 'Threads' },
            { value: 'messages', label: 'Messages' },
            { value: 'users', label: 'Users' },
          ]}
          label="Search type"
          value={searchType}
          onValueChange={(v) => setSearchType(v as SearchType)}
        />
      </div>

      {/* Results */}
      {results && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300 fill-mode-both">
          {results.threads && results.threads.threads && results.threads.threads.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Threads ({results.threads.total})
              </h2>
              <div className="space-y-2">
                {results.threads.threads.map((thread) => (
                  <Link key={thread.id} href={ROUTES.THREAD(thread.slug)}>
                    <div className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 hover:bg-accent transition-all hover:shadow-linear-sm cursor-pointer">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                        <FileText size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-foreground group-hover:text-brand transition-colors">
                          {thread.name}
                        </h3>
                        {thread.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{thread.description}</p>
                        )}
                      </div>
                      <ArrowRight size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {results.messages && results.messages.messages && results.messages.messages.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                Messages ({results.messages.total})
              </h2>
              <div className="space-y-2">
                {results.messages.messages.map((message) => (
                  <Link key={message.id} href={ROUTES.THREAD(message.thread.slug)}>
                    <div className="group rounded-xl border border-border bg-card p-4 hover:bg-accent transition-all hover:shadow-linear-sm cursor-pointer">
                      <p className="text-sm text-foreground line-clamp-2">{message.content}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        by <span className="font-medium">{message.sender.name || message.sender.email}</span> in <span className="font-medium text-brand">{message.thread.name}</span>
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {results.users && results.users.users && results.users.users.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Users ({results.users.total})
              </h2>
              <div className="space-y-2">
                {results.users.users.map((user) => (
                  <Link key={user.id} href={`/user/${user.id}`}>
                    <div className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:bg-accent transition-all hover:shadow-linear-sm cursor-pointer">
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-foreground">
                        {(user.name || user.email)?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-foreground group-hover:text-brand transition-colors">
                          {user.name || user.email}
                        </h3>
                        {user.bio && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{user.bio}</p>
                        )}
                      </div>
                      <ArrowRight size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {(!results.threads?.threads?.length && !results.messages?.messages?.length && !results.users?.users?.length) && (
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Search size={20} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">No results found</p>
              <p className="text-xs text-muted-foreground">Try a different search query or filter.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

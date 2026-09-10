'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, MessageSquare, Users, FileText, Loader2, SearchX, Clock3, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/lib/config/routes';
import { clientLogger } from '@/lib/utils/client-logger';
import { toasts } from '@/lib/utils/toast';
import { CollectionSaveButton } from '@/components/collections/CollectionSaveButton';
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

function highlight(text: string | null | undefined, query: string): React.ReactNode {
  if (!text || !query.trim()) return text ?? '';
  const tokens = query.toLowerCase().trim().split(/\s+/).filter((t) => t.length >= 2).slice(0, 5);
  if (tokens.length === 0) return text;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${tokens.map(esc).join('|')})`, 'gi');
  const parts = text.split(re);
  return parts.map((p, i) => (tokens.some((t) => p.toLowerCase() === t.toLowerCase()) ? <mark key={i} className="bg-amber-200/60 px-0.5 rounded">{p}</mark> : <span key={i}>{p}</span>));
}

const RECENT_KEY = 'sastram_recent_searches';
function loadRecent(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}
function saveRecent(q: string) {
  if (typeof window === 'undefined') return;
  try {
    const prev = loadRecent().filter((x) => x !== q);
    const next = [q, ...prev].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
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
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setRecent(loadRecent());
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleSearch = useCallback(async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q) {
      toasts.error('Enter a search query');
      return;
    }
    if (q.length < 2) {
      toasts.error('Type at least 2 characters');
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    const start = Date.now();
    try {
      const nextResults: SearchResults = { threads: null, messages: null, users: null };
      const tasks: Promise<void>[] = [];

      if (searchType === 'all' || searchType === 'threads') {
        tasks.push(
          searchThreadsAction({ query: q }).then((res) => {
            if (res.error) throw new Error(res.error);
            nextResults.threads = (res.data as SearchResults['threads']) || null;
          })
        );
      }
      if (searchType === 'all' || searchType === 'messages') {
        tasks.push(
          searchMessagesAction({ query: q }).then((res) => {
            if (res.error) throw new Error(res.error);
            nextResults.messages = (res.data as SearchResults['messages']) || null;
          })
        );
      }
      if (searchType === 'all' || searchType === 'users') {
        tasks.push(
          searchUsersAction({ query: q }).then((res) => {
            if (res.error) throw new Error(res.error);
            nextResults.users = (res.data as SearchResults['users']) || null;
          })
        );
      }

      await Promise.all(tasks);
      setResults(nextResults);
      setElapsedMs(Date.now() - start);
      saveRecent(q);
      setRecent(loadRecent());
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Search failed. Please try again.';
      clientLogger.error('Search error', msg);
      setSearchError(msg);
      toasts.error(msg);
    } finally {
      setIsSearching(false);
    }
  }, [query, searchType]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) return;
    debounceRef.current = setTimeout(() => {
      void handleSearch(q);
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, handleSearch]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 md:px-6">
      <div className="flex items-center gap-3">
        <Search className="h-6 w-6" />
        <h1 className="font-serif-heading text-2xl">Search</h1>
    </div>

        <Card className="p-6 space-y-4">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              placeholder="Search threads, messages, or users… (⌘K)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button type="button" onClick={() => handleSearch()} disabled={isSearching}>
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
          {query.trim().length > 0 && query.trim().length < 2 && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-control px-2.5 py-1.5">Type at least 2 characters — search is typo-tolerant and ranks by title &gt; description.</p>
          )}
        </Card>

        {!isSearching && !results && !searchError && query.trim().length < 2 && recent.length > 0 && (
          <Card className="p-4">
            <p className="text-xs font-medium text-ink-3 mb-2 flex items-center gap-1.5"><Clock3 size={12}/> Recent searches</p>
            <div className="flex flex-wrap gap-1.5">
              {recent.map((q) => (
                <Button key={q} variant="outline" size="sm" className="h-7 text-xs rounded-full" onClick={() => { setQuery(q); handleSearch(q); }}>{q}</Button>
              ))}
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { localStorage.removeItem(RECENT_KEY); setRecent([]); }}>Clear</Button>
            </div>
          </Card>
        )}

        {isSearching && <SearchSkeleton />}

        {searchError && !isSearching && (
          <Card className="p-6 text-center border-destructive/30 bg-destructive/5">
            <p className="text-sm font-medium text-destructive">{searchError}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => handleSearch()}>
              Try again
            </Button>
          </Card>
        )}

        {results && !isSearching && !searchError && (
          <div
            className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300 fill-mode-both"
          >
            <div className="flex items-center justify-between text-xs text-ink-3">
              <span className="flex items-center gap-1.5"><Sparkles size={12} className="text-brand"/> Ranked by relevance (title &gt; description) + typo tolerance{elapsedMs != null ? ` · ${elapsedMs}ms` : ''}</span>
              <span className="hidden sm:inline">Tip: type ≥2 chars, we handle typos like “recieve” → “receive”</span>
            </div>
            {(() => {
              const hasAny =
                (results.threads?.total ?? 0) > 0 ||
                (results.messages?.total ?? 0) > 0 ||
                (results.users?.total ?? 0) > 0;
              if (!hasAny) {
                return (
                  <Card className="p-8 md:p-12 text-center flex flex-col items-center border-dashed shadow-none">
                    <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
                      <SearchX size={22} className="text-muted-foreground" />
                    </div>
                    <p className="text-lg font-semibold text-ink">No results for &ldquo;{query}&rdquo;</p>
                    <p className="text-sm text-ink-3 mt-1 max-w-sm">We rank by title &gt; description &gt; summary and allow 1-2 typos. Try fewer words, check spelling, or switch the filter above.</p>
                    {recent.length > 0 && <p className="text-xs text-ink-3 mt-2">Recent: {recent.join(' · ')}</p>}
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
            {results.threads && (
              <div>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Threads ({results.threads.total || 0}){results.threads.hasMore ? ' — more available' : ''}
                </h2>
                {results.threads.total === 0 ? (
                  <p className="text-sm text-ink-3 ml-1">No thread matches — try a broader term or check “Messages”.</p>
                ) : (
                  <div className="grid gap-4">
                    {results.threads.threads?.map((thread) => (
                      <div key={thread.id} className="group flex items-center gap-3 rounded-card border border-line bg-surface p-4 hover:bg-hover transition-colors">
                        <Link href={ROUTES.THREAD(thread.slug)} className="flex-1 min-w-0">
                          <h3 className="font-semibold text-ink group-hover:text-brand truncate">{highlight(thread.name, query)}</h3>
                          {thread.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{highlight(thread.description, query)}</p>
                          )}
                          <p className="text-xs text-ink-3 mt-2">{thread.messageCount} msgs · {thread.memberCount ?? 0} members</p>
                        </Link>
                        <div className="shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <CollectionSaveButton threadId={thread.id} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {results.messages && (
              <div>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Messages ({results.messages.total || 0}){results.messages.hasMore ? ' — more available' : ''}
                </h2>
                {results.messages.total === 0 ? (
                  <p className="text-sm text-ink-3 ml-1">No message matches — try “Threads” or fewer keywords.</p>
                ) : (
                  <div className="grid gap-4">
                    {results.messages.messages?.map((message) => (
                      <div key={message.id} className="group flex items-center gap-3 rounded-card border border-line bg-surface p-4 hover:bg-hover transition-colors">
                        <Link href={ROUTES.THREAD(message.thread.slug)} className="flex-1 min-w-0">
                          <p className="text-sm text-ink line-clamp-3 group-hover:text-brand">{highlight(message.content.slice(0, 280), query)}</p>
                          <p className="text-xs text-muted-foreground mt-2">
                            by {message.sender.name || 'Unknown'} in <span className="font-medium">{message.thread.name}</span>
                          </p>
                        </Link>
                        <div className="shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <CollectionSaveButton messageId={message.id} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {results.users && (
              <div>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Users ({results.users.total || 0}){results.users.hasMore ? ' — more available' : ''}
                </h2>
                {results.users.total === 0 ? (
                  <p className="text-sm text-ink-3 ml-1">No user matches — try name or bio keywords.</p>
                ) : (
                  <div className="grid gap-4">
                    {results.users.users?.map((user) => (
                      <Link key={user.id} href={`/user/${user.id}`}>
                        <Card className="p-4 hover:bg-hover transition-colors">
                          <h3 className="font-semibold text-ink">{highlight(user.name || 'Unknown', query)}</h3>
                          {user.bio && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{highlight(user.bio, query)}</p>
                          )}
                        </Card>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
   </div>
  );
}

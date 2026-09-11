'use client';

import React from 'react';
import Link from 'next/link';
import { Hash, MessageSquare, Clock, Search, X } from 'lucide-react';
import type { ThreadSummary } from '@/modules/threads/types';
import TimeAgo from '@/components/ui/TimeAgo';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CollectionSaveButton } from '@/components/collections/CollectionSaveButton';
import { BulkSaveButton } from '@/components/collections/BulkSaveButton';

function tokenize(q: string): string[] {
  return q.toLowerCase().trim().split(/\s+/).map((t) => t.replace(/[^a-z0-9_-]/g, '')).filter((t) => t.length >= 2).slice(0, 5);
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const tokens = tokenize(query);
  if (tokens.length === 0) return text;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${tokens.map(esc).join('|')})`, 'gi');
  const parts = text.split(re);
  return parts.map((p, i) => (tokens.some((t) => p.toLowerCase() === t.toLowerCase()) ? <mark key={i} className="bg-amber-200/60 px-0.5 rounded">{p}</mark> : <span key={i}>{p}</span>));
}

function matches(thread: ThreadSummary, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const hay = `${thread.name} ${thread.description ?? ''}`.toLowerCase();
  return tokens.some((tok) => hay.includes(tok));
}

export function ThreadListFilter({ threads }: { threads: ThreadSummary[] }) {
  const [query, setQuery] = React.useState('');
  const deferredQuery = React.useDeferredValue(query);
  const isStale = deferredQuery !== query;

  const tokens = React.useMemo(() => tokenize(deferredQuery), [deferredQuery]);
  const filtered = React.useMemo(() => {
    if (tokens.length === 0) return threads;
    return threads.filter((t) => matches(t, tokens));
  }, [threads, tokens]);
  const [visibleCount, setVisibleCount] = React.useState(30);
  React.useEffect(() => { setVisibleCount(30); }, [tokens]);
  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="space-y-3">
      {threads.length > 5 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <Input
              placeholder="Filter threads… (typo-tolerant)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink">
                <X size={14} />
              </button>
            )}
          </div>
          <span className="text-xs text-ink-3 whitespace-nowrap">
            {tokens.length ? `${filtered.length} of ${threads.length}` : `${threads.length} threads`}
            {isStale && ' · filtering…'}
          </span>
        </div>
      )}
      {filtered.length > 1 && (
        <div className="flex justify-end">
          <BulkSaveButton items={filtered.map((t) => ({ threadId: t.id }))} label={`Save all ${filtered.length}`} />
        </div>
      )}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center rounded-card border border-dashed border-line bg-surface">
          <p className="text-sm font-medium text-ink">No matches for “{query}”</p>
          <p className="text-xs text-ink-3 mt-1">Try fewer words or check spelling — filter is typo-tolerant.</p>
          <Button variant="outline" size="sm" className="mt-3 h-7 text-xs" onClick={() => setQuery('')}>Clear filter</Button>
        </div>
      ) : (
        <div className={`overflow-hidden rounded-card border border-line bg-surface shadow-card ${isStale ? 'opacity-60' : ''}`}>
          {visible.map((thread) => {
            const isVerified = !!thread.verifiedAt;
            return (
              <div
                key={thread.id}
                className="group flex items-center gap-3 border-b border-line/60 p-4 transition-colors last:border-b-0 hover:bg-hover"
              >
                <Link
                  href={`/dashboard/threads/${thread.slug}`}
                  prefetch={false}
                  className="flex flex-1 min-w-0 items-start gap-3 focus-visible:outline-none"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-brand/15 bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-primary-foreground">
                    <Hash size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex min-w-0 items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-ink truncate group-hover:text-brand transition-colors">
                        {highlight(thread.name, deferredQuery)}
                      </h3>
                      {isVerified && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                          ✓ Verified
                        </span>
                      )}
                      {thread.resolutionScore != null && (
                        <span className="text-[11px] font-medium text-ink-3 tabular-nums">{thread.resolutionScore}/100</span>
                      )}
                    </div>
                    {thread.description && (
                      <p className="text-xs text-ink-3 mt-1 line-clamp-1">{highlight(thread.description, deferredQuery)}</p>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-xs text-ink-3">
                      <span className="flex items-center gap-1">
                        <MessageSquare size={10} />
                        {thread.messageCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        <TimeAgo date={thread.updatedAt} />
                      </span>
                    </div>
                  </div>
                </Link>
                <div className="shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity" onClick={(e) => e.preventDefault()}>
                  <CollectionSaveButton threadId={thread.id} />
                </div>
              </div>
            );
          })}
          {filtered.length > visibleCount && (
            <div className="p-3 flex justify-center border-t border-line/60">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setVisibleCount((c) => c + 30)}>
                Show {Math.min(30, filtered.length - visibleCount)} more · {filtered.length - visibleCount} left
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

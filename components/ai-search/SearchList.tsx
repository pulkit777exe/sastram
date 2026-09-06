'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/* ─────────────────────────────────────────────────────────
 * SEARCH — command search with live filtering.
 * The field, clear action, and results are directly usable.
 * ───────────────────────────────────────────────────────── */

const ITEMS = [
  'Forecast summer demand',
  'Find waffle cone suppliers',
  'Compare seasonal flavors',
  'Draft flavor launch plan',
  'Check cold-chain status',
  'Audit sugar costs',
  'Retire low sellers',
];

export function SearchList() {
  const [query, setQuery] = useState('');
  const results = query
    ? ITEMS.filter((i) => i.toLowerCase().includes(query.toLowerCase()))
    : ITEMS.slice(0, 5);
  const empty = query.length > 2 && results.length === 0;

  return (
    <div className="flex min-h-[248px] w-full max-w-xs flex-col items-stretch">
      <div className="w-full self-start overflow-hidden rounded-card bg-surface border border-line shadow-raised">
        {/* input row */}
        <div className="flex h-10 items-center gap-2 border-b border-line px-3 transition-colors duration-100 hover:bg-hover">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth="2"
            strokeLinecap="round"
            className="shrink-0"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search flavors…"
            aria-label="Search flavors"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-auto p-0"
          />
          {query && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Clear search"
              className="size-5.5 rounded-full text-ink-3 hover:bg-line/70 hover:text-ink"
              onClick={() => setQuery('')}
              style={{ animation: 'fade-in 150ms ease-out both' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </Button>
          )}
        </div>

        {/* results / empty state */}
        {empty ? (
          <div className="flex flex-col items-center justify-center gap-1 px-4 py-8" style={{ animation: 'fade-in 250ms ease-out both' }}>
            <span className="mb-1.5 flex size-8 items-center justify-center rounded-control bg-inset text-ink-3 shadow-hairline">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
            </span>
            <span className="text-[13px] font-medium text-ink">No results found</span>
            <span className="text-[12px] text-ink-3">Adjust your search to try again</span>
          </div>
        ) : (
          <div className="p-1">
            {results.map((item) => (
              <Button
                key={item}
                variant="ghost"
                className="w-full justify-start h-8 text-[13px] text-ink"
                onClick={() => setQuery(item)}
                style={{ animation: 'fade-in 200ms ease-out both' }}
              >
                {item}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
export default SearchList;

'use client';

import { useState, useRef, useCallback } from 'react';
import { Search, Zap, TableProperties, ArrowUp } from 'lucide-react';
import type { SearchConfig } from '@/modules/ai-search/types';
import { ModeDropdown } from './ModeDropdown';

interface SearchBoxProps {
  onSearch: (query: string, config: SearchConfig) => void;
  isLoading: boolean;
  compact?: boolean;
  initialQuery?: string;
}

const EXA_MODES = [
  { value: 'agentic', label: 'Agentic' },
  { value: 'instant', label: 'Instant' },
  { value: 'websets', label: 'Websets' },
] as const;

const TAVILY_MODES = [
  { value: 'search', label: 'Search' },
  { value: 'extract', label: 'Extract' },
  { value: 'crawl', label: 'Crawl' },
  { value: 'research', label: 'Research' },
] as const;

const SOURCE_FILTERS = [
  { value: 'all', label: 'All Sources' },
  { value: 'technical', label: 'Technical' },
  { value: 'reddit-hn', label: 'Reddit & HN' },
  { value: 'docs', label: 'Official Docs' },
] as const;

export function SearchBox({ onSearch, isLoading, compact = false, initialQuery = '' }: SearchBoxProps) {
  const [query, setQuery] = useState(initialQuery);
  const [searchMode, setSearchMode] = useState<SearchConfig['searchMode']>('standard');
  const [exaMode, setExaMode] = useState<SearchConfig['exaMode']>('agentic');
  const [tavilyMode, setTavilyMode] = useState<SearchConfig['tavilyMode']>('search');
  const [sourceFilter, setSourceFilter] = useState<SearchConfig['sourceFilter']>('all');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 3 || isLoading) return;
    onSearch(trimmed, { exaMode, tavilyMode, sourceFilter, searchMode });
  }, [query, exaMode, tavilyMode, sourceFilter, searchMode, isLoading, onSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const modeButtons = [
    { mode: 'standard' as const, icon: Search, label: 'Standard' },
    { mode: 'instant' as const, icon: Zap, label: 'Instant' },
    { mode: 'table' as const, icon: TableProperties, label: 'Table' },
  ];

  return (
    <div className={`w-full transition-all duration-300 ${compact ? 'max-w-3xl' : 'max-w-2xl'}`}>
      {/* Source filter pills — idle only */}
      {!compact && (
        <div className="flex items-center gap-2 mb-3 justify-center">
          {SOURCE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setSourceFilter(f.value as SearchConfig['sourceFilter'])}
              className={`px-3 py-1 text-xs rounded-full border transition-all duration-200 cursor-pointer ${
                sourceFilter === f.value
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Search input container */}
      <div
        className={`relative bg-card border border-border shadow-linear-sm hover:shadow-linear-md transition-shadow duration-300 ${
          compact ? 'rounded-xl' : 'rounded-2xl'
        }`}
      >
        <textarea
          ref={textareaRef}
          value={query}
          onChange={(e) => setQuery(e.target.value.substring(0, 500))}
          onKeyDown={handleKeyDown}
          placeholder={
            compact ? 'Search again...' : 'Search across Reddit, HN, ArchWiki, Stack Overflow...'
          }
          rows={compact ? 1 : 2}
          className={`w-full bg-transparent resize-none outline-none text-foreground placeholder:text-muted-foreground px-4 ${
            compact ? 'py-3 text-sm' : 'py-4 text-base'
          }`}
          disabled={isLoading}
          aria-label="Search query"
          maxLength={500}
        />

        {/* Bottom bar */}
        <div className="flex items-center justify-between px-3 pb-3">
          {/* Left: Mode toggles */}
          <div className="flex items-center gap-1">
            {modeButtons.map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setSearchMode(mode)}
                title={label}
                aria-pressed={searchMode === mode}
                className={`p-1.5 rounded-lg transition-all duration-200 cursor-pointer ${
                  searchMode === mode
                    ? 'bg-foreground/10 text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                }`}
              >
                <Icon size={compact ? 14 : 16} />
              </button>
            ))}
          </div>

          {/* Right: Dropdowns + Submit */}
          <div className="flex items-center gap-2">
            <ModeDropdown label="Exa" value={exaMode} options={EXA_MODES} onChange={setExaMode} />
            <ModeDropdown
              label="Tavily"
              value={tavilyMode}
              options={TAVILY_MODES}
              onChange={setTavilyMode}
            />

            {/* Submit button */}
            <button
              onClick={handleSubmit}
              disabled={!query.trim() || query.trim().length < 3 || isLoading}
              aria-label="Submit search"
              className={`p-2 rounded-xl transition-all duration-200 cursor-pointer ${
                query.trim().length >= 3 && !isLoading
                  ? 'bg-foreground text-background hover:opacity-90 shadow-linear-sm'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}
            >
              {/* Loading indicator is owned by the PhaseTracker pill — the submit
                  icon just returns to its muted/disabled idle state while a
                  search is in flight, rather than spinning concurrently. */}
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Character count */}
      {!compact && query.length > 400 && (
        <p className="text-xs text-muted-foreground mt-1 text-right">{query.length}/500</p>
      )}
    </div>
  );
}
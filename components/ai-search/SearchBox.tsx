'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Search, Zap, TableProperties, ArrowUp, ChevronDown } from 'lucide-react';
import type { SearchConfig } from '@/modules/ai-search/types';

interface SearchBoxProps {
  onSearch: (query: string, config: SearchConfig) => void;
  isLoading: boolean;
  compact?: boolean;
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

export function SearchBox({ onSearch, isLoading, compact = false }: SearchBoxProps) {
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchConfig['searchMode']>('standard');
  const [exaMode, setExaMode] = useState<SearchConfig['exaMode']>('agentic');
  const [tavilyMode, setTavilyMode] = useState<SearchConfig['tavilyMode']>('search');
  const [sourceFilter, setSourceFilter] = useState<SearchConfig['sourceFilter']>('all');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    }
    if (activeDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [activeDropdown]);

  const handleSubmit = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 3 || isLoading) return;
    setActiveDropdown(null);
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
        className={`relative bg-card border border-border shadow-sm hover:shadow-md transition-shadow duration-300 ${
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
        <div className="flex items-center justify-between px-3 pb-3" ref={dropdownRef}>
          {/* Left: Mode toggles */}
          <div className="flex items-center gap-1">
            {modeButtons.map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setSearchMode(mode)}
                title={label}
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
            {/* Exa mode dropdown */}
            <div className="relative">
              <button
                onClick={() => setActiveDropdown(activeDropdown === 'exa' ? null : 'exa')}
                className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded-md hover:bg-foreground/5 cursor-pointer"
              >
                Exa: {EXA_MODES.find((m) => m.value === exaMode)?.label}
                <ChevronDown size={12} />
              </button>
              {activeDropdown === 'exa' && (
                <div className="absolute bottom-full mb-1 right-0 bg-popover border border-border rounded-lg shadow-lg py-1 z-50 min-w-[120px]">
                  {EXA_MODES.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => {
                        setExaMode(m.value);
                        setActiveDropdown(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                        exaMode === m.value
                          ? 'bg-accent text-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tavily mode dropdown */}
            <div className="relative">
              <button
                onClick={() => setActiveDropdown(activeDropdown === 'tavily' ? null : 'tavily')}
                className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded-md hover:bg-foreground/5 cursor-pointer"
              >
                Tavily: {TAVILY_MODES.find((m) => m.value === tavilyMode)?.label}
                <ChevronDown size={12} />
              </button>
              {activeDropdown === 'tavily' && (
                <div className="absolute bottom-full mb-1 right-0 bg-popover border border-border rounded-lg shadow-lg py-1 z-50 min-w-[120px]">
                  {TAVILY_MODES.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => {
                        setTavilyMode(m.value);
                        setActiveDropdown(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                        tavilyMode === m.value
                          ? 'bg-accent text-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Submit button */}
            <button
              onClick={handleSubmit}
              disabled={!query.trim() || query.trim().length < 3 || isLoading}
              aria-label="Submit search"
              className={`p-2 rounded-xl transition-all duration-200 cursor-pointer ${
                query.trim().length >= 3 && !isLoading
                  ? 'bg-foreground text-background hover:opacity-90 shadow-sm'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <ArrowUp size={16} />
              )}
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

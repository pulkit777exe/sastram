'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Search, Paperclip, ArrowUp, Loader2, ChevronDown, Globe, Cpu, FileText, BookOpen, FlaskConical } from 'lucide-react';
import type { SearchConfig } from '@/modules/ai-search/types';

interface SearchBoxProps {
  onSearch: (query: string, config: SearchConfig) => void;
  isLoading: boolean;
  compact?: boolean;
  initialQuery?: string;
}

const EXA_MODES = [
  { value: 'agentic' as const, label: 'Agentic', description: 'Best for complex research', icon: Cpu },
  { value: 'instant' as const, label: 'Instant', description: 'Fast web search', icon: Globe },
  { value: 'websets' as const, label: 'Websets', description: 'Curated web monitoring', icon: FlaskConical },
];

const TAVILY_MODES = [
  { value: 'search' as const, label: 'Search', description: 'General web search', icon: Search },
  { value: 'extract' as const, label: 'Extract', description: 'Extract page content', icon: FileText },
  { value: 'crawl' as const, label: 'Crawl', description: 'Deep crawl a site', icon: BookOpen },
  { value: 'research' as const, label: 'Research', description: 'In-depth research', icon: FlaskConical },
];

export function SearchBox({ onSearch, isLoading, compact = false, initialQuery = '' }: SearchBoxProps) {
  const [query, setQuery] = useState(initialQuery);
  const [exaMode, setExaMode] = useState<SearchConfig['exaMode']>('agentic');
  const [tavilyMode, setTavilyMode] = useState<SearchConfig['tavilyMode']>('search');
  const [openDropdown, setOpenDropdown] = useState<'exa' | 'tavily' | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 3 || isLoading) return;
    onSearch(trimmed, { exaMode, tavilyMode, sourceFilter: 'all', searchMode: 'standard' });
  }, [query, exaMode, tavilyMode, isLoading, onSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    if (!openDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdown]);

  const canSubmit = query.trim().length >= 3 && !isLoading;

  if (compact) {
    return (
      <div className="w-full">
        <div className="relative bg-card border border-border rounded-xl shadow-linear-sm hover:shadow-linear-md transition-shadow duration-300">
          <textarea
            ref={textareaRef}
            value={query}
            onChange={(e) => setQuery(e.target.value.substring(0, 500))}
            onKeyDown={handleKeyDown}
            placeholder="Search again..."
            rows={1}
            className="w-full bg-transparent resize-none outline-none text-foreground placeholder:text-muted-foreground px-4 py-3 text-sm"
            disabled={isLoading}
            aria-label="Search query"
            maxLength={500}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              aria-label="Submit search"
              className={`min-h-9 min-w-9 p-2 rounded-lg transition-all duration-200 cursor-pointer ${
                canSubmit
                  ? 'bg-foreground text-background hover:opacity-90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}
            >
              {isLoading ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={14} />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto relative" ref={dropdownRef}>
      {/* Search input */}
      <div className="relative bg-card border border-border rounded-2xl shadow-linear-sm hover:shadow-linear-md focus-within:shadow-linear-lg focus-within:border-foreground/20 transition-all duration-300">
        <textarea
          ref={textareaRef}
          value={query}
          onChange={(e) => setQuery(e.target.value.substring(0, 500))}
          onKeyDown={handleKeyDown}
          placeholder="Ask Sai..."
          rows={2}
          className="w-full bg-transparent resize-none outline-none text-foreground placeholder:text-muted-foreground px-4 pt-4 pb-2 text-base leading-relaxed"
          disabled={isLoading}
          aria-label="Search query"
          maxLength={500}
        />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-3 pb-3">
          {/* Left: Tools dropdown */}
          <div className="flex items-center gap-1">
            {/* Exa tool */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'exa' ? null : 'exa')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors cursor-pointer"
              >
                <Cpu size={13} />
                <span>Exa: {EXA_MODES.find((m) => m.value === exaMode)?.label}</span>
                <ChevronDown size={12} className={`transition-transform ${openDropdown === 'exa' ? 'rotate-180' : ''}`} />
              </button>
              {openDropdown === 'exa' && (
                <div className="absolute bottom-full mb-2 left-0 bg-popover border border-border rounded-xl shadow-linear-lg py-1.5 z-50 min-w-[200px]">
                  {EXA_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => {
                        setExaMode(mode.value);
                        setOpenDropdown(null);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors cursor-pointer ${
                        exaMode === mode.value
                          ? 'bg-accent text-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      <mode.icon size={14} className="shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium">{mode.label}</p>
                        <p className="text-xs text-muted-foreground">{mode.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tavily tool */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'tavily' ? null : 'tavily')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors cursor-pointer"
              >
                <Search size={13} />
                <span>Tavily: {TAVILY_MODES.find((m) => m.value === tavilyMode)?.label}</span>
                <ChevronDown size={12} className={`transition-transform ${openDropdown === 'tavily' ? 'rotate-180' : ''}`} />
              </button>
              {openDropdown === 'tavily' && (
                <div className="absolute bottom-full mb-2 left-0 bg-popover border border-border rounded-xl shadow-linear-lg py-1.5 z-50 min-w-[220px]">
                  {TAVILY_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => {
                        setTavilyMode(mode.value);
                        setOpenDropdown(null);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors cursor-pointer ${
                        tavilyMode === mode.value
                          ? 'bg-accent text-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      <mode.icon size={14} className="shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium">{mode.label}</p>
                        <p className="text-xs text-muted-foreground">{mode.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Attach + Submit */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="min-h-9 min-w-9 p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors cursor-pointer"
              aria-label="Attach file"
            >
              <Paperclip size={15} />
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              aria-label="Submit search"
              className={`min-h-9 min-w-9 p-2 rounded-xl transition-all duration-200 cursor-pointer ${
                canSubmit
                  ? 'bg-foreground text-background hover:opacity-90 shadow-linear-sm'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}
            >
              {isLoading ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={15} />}
            </button>
          </div>
        </div>
      </div>

      {/* Character count */}
      {query.length > 400 && (
        <p className="text-xs text-muted-foreground mt-1.5 text-right">{query.length}/500</p>
      )}
    </div>
  );
}

'use client';

import { useRef, useEffect } from 'react';
import { Send, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

const TEXTAREA_MAX_HEIGHT = 120;
const MIN_QUERY_LENGTH = 3;

interface SearchInputBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  onSubmit: () => void;
  isStreaming: boolean;
  isChatActive: boolean;
  onNewSearch: () => void;
}

export function SearchInputBar({
  query,
  onQueryChange,
  onSubmit,
  isStreaming,
  isChatActive,
  onNewSearch,
}: SearchInputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function resizeTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT) + 'px';
  }

  useEffect(() => {
    resizeTextarea();
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (query.trim().length >= MIN_QUERY_LENGTH && !isStreaming) {
        onSubmit();
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
      }
    }
  }

  return (
    <div className="sticky bottom-0 z-10 bg-surface border-t border-line px-4 md:px-6 py-3">
      <div className="max-w-3xl mx-auto">
        {/* swapped colors for contrast + Claude-like pill */}
        <div className="flex items-center gap-2 bg-canvas border border-line-strong rounded-full shadow-sm px-2 py-2 focus-within:border-sai-accent/30 focus-within:ring-2 focus-within:ring-sai-accent/10 focus-within:shadow-md transition-all">
          <textarea
            ref={textareaRef}
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder={isChatActive ? 'Ask a follow-up question...' : 'Search across Sastram...'}
            rows={1}
            className="flex-1 min-w-0 resize-none bg-transparent px-3 py-1.5 text-[15px] leading-5 text-ink placeholder:text-ink-3 focus:outline-none"
            style={{ minHeight: '24px', maxHeight: '120px' }}
          />

          <Button
            type="button"
            size="icon"
            onClick={onSubmit}
            disabled={isStreaming || query.trim().length < MIN_QUERY_LENGTH}
            aria-label="Send"
            className="shrink-0 size-8 rounded-full bg-sai-accent text-white shadow-btn hover:bg-sai-accent/90 disabled:bg-field disabled:text-ink-3 disabled:shadow-none disabled:border disabled:border-line"
          >
            {isStreaming ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
          </Button>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 px-1 text-[11px] leading-none text-ink-3">
          <span className="truncate">Sai is AI and can make mistakes. Check sources.</span>
          <span className="hidden sm:inline shrink-0">Sai • Medium</span>
        </div>

        {isChatActive && (
          <div className="mt-2 flex justify-start">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 rounded-full px-3 text-xs font-medium text-ink-2 hover:text-ink hover:bg-hover border border-transparent hover:border-line"
              onClick={onNewSearch}
            >
              <Plus size={12} />
              New conversation
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

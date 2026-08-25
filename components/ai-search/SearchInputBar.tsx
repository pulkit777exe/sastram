'use client';

import { useRef, useCallback, useEffect } from 'react';
import { Send, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [query, resizeTextarea]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (query.trim().length >= 3 && !isStreaming) {
          onSubmit();
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
          }
        }
      }
    },
    [query, isStreaming, onSubmit]
  );

  return (
    <div className="border-t border-line bg-canvas px-4 md:px-6 py-4">
      <div className="max-w-3xl mx-auto">
        <div className="relative bg-surface border border-line rounded-card shadow-card overflow-hidden transition-shadow duration-150 focus-within:shadow-raised focus-within:border-line-strong">
          <textarea
            ref={textareaRef}
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder={isChatActive ? 'Ask a follow-up question...' : 'Search across Sastram...'}
            rows={1}
            className="w-full resize-none bg-transparent px-4 py-3 pr-14 text-sm text-ink placeholder:text-ink-3 focus:outline-none"
            style={{ minHeight: '48px', maxHeight: '120px' }}
          />
          <Button
            type="button"
            size="icon"
            onClick={onSubmit}
            disabled={isStreaming || query.trim().length < 3}
            className="absolute right-3 bottom-3 h-8 w-8 bg-sai-accent text-white hover:opacity-90 disabled:opacity-30"
          >
            {isStreaming ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Send size={15} />
            )}
          </Button>
        </div>
        {isChatActive && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2.5 text-xs text-ink-3 hover:text-ink"
            onClick={onNewSearch}
          >
            <Plus size={12} className="mr-1" />
            New conversation
          </Button>
        )}
      </div>
    </div>
  );
}

'use client';

import { type RefObject } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils/cn';

export interface MentionCandidate {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  handle: string;
}

interface MentionSuggestProps {
  open: boolean;
  candidates: MentionCandidate[];
  activeIndex: number;
  onSelect: (candidate: MentionCandidate) => void;
  onHover: (index: number) => void;
  listRef: RefObject<HTMLDivElement | null>;
}

export function MentionSuggest({
  open,
  candidates,
  activeIndex,
  onSelect,
  onHover,
  listRef,
}: MentionSuggestProps) {
  if (!open || candidates.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-13 left-4 z-30 w-[280px] rounded-xl border border-border bg-popover shadow-xl overflow-hidden"
    >
      <div className="max-h-56 overflow-y-auto py-1.5">
        {candidates.map((candidate, index) => (
          <button
            key={candidate.id}
            type="button"
            className={cn(
              'w-full px-3 py-2 text-left text-xs flex items-center gap-2.5 transition-colors',
              index === activeIndex
                ? 'bg-indigo-50/80 text-indigo-900'
                : 'hover:bg-muted/50 text-foreground'
            )}
            onMouseEnter={() => onHover(index)}
            onClick={() => onSelect(candidate)}
          >
            <Avatar className="size-6 shrink-0">
              <AvatarImage src={candidate.image ?? undefined} alt={candidate.name ?? candidate.handle} />
              <AvatarFallback className="text-[10px] font-medium">
                {(candidate.name ?? candidate.handle).charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <span className="font-semibold truncate">
                {candidate.name || candidate.email}
              </span>
              <span className="text-[10px] text-muted-foreground truncate">
                @{candidate.handle}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

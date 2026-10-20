'use client';

import { cn } from '@/lib/utils/cn';
import type { MessageReaction } from '@/lib/types';

interface MessageReactionsProps {
  reactions: MessageReaction[];
  onToggle: (emoji: string) => void;
  isPending?: boolean;
}

/** Discord-style reaction chips — always visible, click to toggle. */
export function MessageReactions({ reactions, onToggle, isPending = false }: MessageReactionsProps) {
  if (reactions.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          onClick={() => onToggle(reaction.emoji)}
          aria-pressed={reaction.hasReacted}
          aria-label={`${reaction.emoji} ${reaction.count} reaction${reaction.count === 1 ? '' : 's'}${reaction.hasReacted ? ', including you' : ''}`}
          className={cn(
            'flex h-7 items-center gap-1 rounded-full border px-2 text-xs transition-colors',
            reaction.hasReacted
              ? 'border-brand/40 bg-brand/10 text-ink'
              : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:bg-hover',
            isPending && 'cursor-wait'
          )}
        >
          <span className="text-[14px] leading-none">{reaction.emoji}</span>
          <span className="font-medium tabular-nums">{reaction.count}</span>
        </button>
      ))}
    </div>
  );
}

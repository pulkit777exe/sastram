import React, { useState } from 'react';
import { MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Message } from '@/lib/types/index';

interface InlineReplyThreadProps {
  replies: Message[];
  onReplyClick?: (messageId?: string) => void;
}

export const InlineReplyThread = React.memo(function InlineReplyThread({ replies, onReplyClick }: InlineReplyThreadProps) {
  const [expanded, setExpanded] = useState(false);

  if (replies.length === 0) return null;

  // Show unique senders (for stacked avatars, max 4)
  const uniqueSenders = Array.from(
    new Map(replies.map((r) => [r.senderId, r.sender])).values()
  ).slice(0, 4);

  const visible = expanded ? replies : replies.slice(0, 3);
  const hidden = replies.length - 3;
  const lastReply = replies[replies.length - 1];

  return (
    <div className="mt-2 group/thread">
      {/* Collapsed summary bar — always visible */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onReplyClick?.()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onReplyClick?.(); }}
        className="flex items-center gap-2.5 w-full text-left group/bar hover:bg-brand/10 dark:hover:bg-brand/15 rounded-lg px-2.5 py-1.5 transition-colors duration-100 cursor-pointer"
      >
        {/* Stacked avatars */}
        <div className="flex -space-x-1.5 shrink-0">
          {uniqueSenders.map((sender) => (
            <Avatar
              key={sender.id}
              className="w-5 h-5 ring-2 ring-background"
            >
              <AvatarImage src={sender.image || ''} />
              <AvatarFallback className="bg-brand/15 text-brand text-[8px] font-bold">
                {sender.name?.substring(0, 1).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
          ))}
        </div>

        {/* Reply count */}
        <span className="text-[12px] font-semibold text-brand group-hover/bar:text-brand transition-colors">
          {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
        </span>

        {/* Last reply preview */}
        {lastReply && !expanded && (
          <span className="text-[11px] text-muted-foreground/70 truncate flex-1 min-w-0">
            <span className="font-medium text-foreground/60 mr-1">
              {lastReply.sender.name?.split(' ')[0]}:
            </span>
            {lastReply.content.slice(0, 60)}{lastReply.content.length > 60 ? '…' : ''}
          </span>
        )}

        {/* Expand/collapse toggle */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((p) => !p);
          }}
          className="ml-auto shrink-0 text-muted-foreground/50 hover:text-brand transition-colors"
          title={expanded ? 'Collapse replies' : 'Expand replies'}
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {/* Expanded reply list */}
      {expanded && (
        <div className="mt-1 pl-2.5 border-l-2 border-brand/20 dark:border-brand/30 flex flex-col gap-0.5 ml-2.5">
          {visible.map((reply) => (
            <div
              key={reply.id}
              className="flex items-start gap-2 text-[12px] py-1 px-2 rounded-lg hover:bg-muted/40 cursor-pointer group/reply transition-colors"
              onClick={() => onReplyClick?.(reply.id)}
            >
              <Avatar className="w-4 h-4 mt-0.5 shrink-0">
                <AvatarImage src={reply.sender.image || ''} />
                <AvatarFallback className="bg-brand/10 text-brand text-[7px] font-bold">
                  {reply.sender.name?.substring(0, 1).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 leading-relaxed">
                <span className="font-semibold text-foreground/80 mr-1.5">
                  {reply.sender.name?.split(' ')[0] || 'Anonymous'}
                </span>
                <span className="text-muted-foreground/80">{reply.content}</span>
              </div>
            </div>
          ))}

          {hidden > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
              }}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-brand hover:text-brand px-2 py-1 w-fit transition-colors"
            >
              <MessageCircle size={11} />
              {hidden} more {hidden === 1 ? 'reply' : 'replies'}
            </button>
          )}

          {/* Reply CTA */}
          <button
            type="button"
            onClick={() => onReplyClick?.()}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-brand px-2 py-1 w-fit transition-colors mt-0.5"
          >
            <MessageCircle size={11} />
            Reply to thread
          </button>
        </div>
      )}
    </div>
  );
});

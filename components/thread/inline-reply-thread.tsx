import React, { useState, useRef } from 'react';
import { MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { Message } from '@/lib/types/index';
import { useVirtualizer } from '@tanstack/react-virtual';

interface InlineReplyThreadProps {
  replies: Message[];
  onReplyClick?: (messageId?: string) => void;
}

const REPLY_OVERSCAN = 5;

function getUniqueSenders(replies: Message[]): Array<NonNullable<Message['sender']>> {
  const seen = new Map<string, NonNullable<Message['sender']>>();
  for (const reply of replies) {
    if (reply.sender === null || reply.sender === undefined) {
      continue;
    }
    const senderId = reply.senderId;
    if (!senderId) {
      continue;
    }
    if (!seen.has(senderId)) {
      seen.set(senderId, reply.sender);
    }
  }
  return Array.from(seen.values()).slice(0, 4);
}

export const InlineReplyThread = React.memo(function InlineReplyThread({ replies, onReplyClick }: InlineReplyThreadProps) {
  const [expanded, setExpanded] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const uniqueSenders = getUniqueSenders(replies);

  const visible = expanded ? replies : replies.slice(0, 3);
  const hidden = replies.length - 3;
  const lastReply = replies.length > 0 ? replies[replies.length - 1] : null;
  const shouldVirtualize = expanded && replies.length > 20;

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: replies.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 40,
    measureElement: (element) => element?.getBoundingClientRect().height ?? 40,
    overscan: REPLY_OVERSCAN,
    enabled: shouldVirtualize,
  });

  if (replies.length === 0) return null;

  return (
    <div className="mt-2 group/thread max-w-[min(100%,56rem)]">
      {/* Collapsed summary bar - always visible */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onReplyClick?.()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onReplyClick?.(); }}
        className="flex items-center gap-2.5 w-full min-h-8 text-left group/bar rounded-control border border-line/50 bg-muted/20 hover:bg-muted/20 dark:bg-muted/15 dark:hover:bg-muted/15 px-2.5 py-1.5 transition-colors duration-100 cursor-pointer"
      >
        <div className="flex -space-x-1.5 shrink-0">
          {uniqueSenders.map((sender) => (
            <Avatar
              key={sender.id}
              className="w-5 h-5 ring-2 ring-card"
            >
              <AvatarImage src={sender.image || ''} />
              <AvatarFallback className="bg-brand/15 text-brand text-xs font-bold">
                {sender.name?.substring(0, 1).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
          ))}
        </div>

        <span className="text-xs font-semibold text-brand group-hover/bar:text-brand transition-colors">
          {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
        </span>

        {lastReply && !expanded && (
          <span className="text-xs text-muted-foreground/70 truncate flex-1 min-w-0">
            <span className="font-medium text-foreground/60 mr-1">
              {lastReply.sender?.name?.split(' ')[0]}:
            </span>
            {lastReply.content.slice(0, 60)}{lastReply.content.length > 60 ? '…' : ''}
          </span>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-6 shrink-0 text-muted-foreground/50 hover:bg-muted/60 hover:text-brand"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((p) => !p);
          }}
          title={expanded ? 'Collapse replies' : 'Expand replies'}
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </Button>
      </div>

      {expanded && (
        <div className="mt-1.5 ml-2.5 border-l border-line/70 pl-2.5">
          {shouldVirtualize ? (
            /* Virtualized list for large reply counts */
            <div
              ref={scrollContainerRef}
              className="max-h-100 overflow-y-auto"
            >
              <div style={{ position: 'relative', height: `${virtualizer.getTotalSize()}px` }}>
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const reply = replies[virtualItem.index];
                  return (
                    <div
                      key={reply.id}
                      data-index={virtualItem.index}
                      ref={(node) => {
                        if (node) virtualizer.measureElement(node);
                      }}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <ReplyItem reply={reply} onReplyClick={onReplyClick} />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Non-virtualized list for small reply counts */
            <div className="flex flex-col gap-0.5">
              {visible.map((reply) => (
                <ReplyItem key={reply.id} reply={reply} onReplyClick={onReplyClick} />
              ))}

              {hidden > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs font-semibold text-brand hover:text-brand px-2 py-1 w-fit h-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(true);
                  }}
                >
                  <MessageCircle size={11} className="mr-1.5" />
                  {hidden} more {hidden === 1 ? 'reply' : 'replies'}
                </Button>
              )}
            </div>
          )}

          {/* Reply CTA */}
          <Button
            variant="ghost"
            size="sm"
            className="text-xs font-semibold text-muted-foreground hover:text-brand px-2 py-1 w-fit h-auto mt-0.5"
            onClick={() => onReplyClick?.()}
          >
            <MessageCircle size={11} className="mr-1.5" />
            Reply to thread
          </Button>
        </div>
      )}
    </div>
  );
});

function ReplyItem({
  reply,
  onReplyClick,
}: {
  reply: Message;
  onReplyClick?: (messageId?: string) => void;
}) {
  return (
    <div
      className="flex items-start gap-2 text-xs py-1 px-2 rounded-control hover:bg-muted/20 cursor-pointer group/reply transition-colors"
      onClick={() => onReplyClick?.(reply.id)}
    >
      <Avatar className="w-4 h-4 mt-0.5 shrink-0">
        <AvatarImage src={reply.sender?.image || ''} />
        <AvatarFallback className="bg-brand/10 text-brand text-xs font-bold">
          {reply.sender?.name?.substring(0, 1).toUpperCase() || 'U'}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0 leading-relaxed">
        <span className="font-semibold text-foreground/80 mr-1.5">
          {reply.sender?.name?.split(' ')[0] || 'Anonymous'}
        </span>
        <span className="text-muted-foreground/80">{reply.content}</span>
      </div>
    </div>
  );
}

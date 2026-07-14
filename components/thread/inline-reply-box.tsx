'use client';

import { useEffect, useRef } from 'react';
import { Reply, X, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useMessageComposer } from '@/hooks/chat/use-message-composer';
import { cn } from '@/lib/utils/cn';
import type { Message } from '@/lib/types/index';

const MAX_VISUAL_DEPTH = 4;

interface InlineReplyBoxProps {
  parentMessage: {
    id: string;
    depth: number;
    sender: {
      name: string | null;
    } | null;
  };
  threadId: string;
  currentUser: {
    id: string;
    name: string | null;
    image: string | null;
  };
  visualDepth: number;
  onCancel: () => void;
  onMessagePosted: (message: Message) => void;
  onOptimisticMessage?: (message: Message) => void;
}

export function InlineReplyBox({
  parentMessage,
  threadId,
  currentUser,
  visualDepth,
  onCancel,
  onMessagePosted,
  onOptimisticMessage,
}: InlineReplyBoxProps) {
  const replyDepth = Math.min(parentMessage.depth + 1, MAX_VISUAL_DEPTH);

  const {
    content,
    isSubmitting,
    error,
    textareaRef,
    handleKeyDown,
    handleChange,
    handleBlur,
    handleSubmit,
    cleanup,
  } = useMessageComposer({
    threadId,
    parentId: parentMessage.id,
    depth: replyDepth,
    currentUser: currentUser ? { ...currentUser, name: currentUser.name ?? '' } : undefined,
    onMessagePosted,
    onOptimisticMessage,
  });

  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [textareaRef]);

  useEffect(() => cleanup, [cleanup]);

  const triggerShake = () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const input = wrap.querySelector('.t-input');
    if (!input) return;
    input.classList.remove('is-shaking');
    void (input as HTMLElement).offsetWidth;
    input.classList.add('is-shaking');
    setTimeout(() => input.classList.remove('is-shaking'), 300);
  };

  const handleSubmitWithShake = async () => {
    if (!content.trim()) {
      triggerShake();
    }
    await handleSubmit();
  };

  return (
    <div
      className="mt-2 animate-in slide-in-from-top-1 fade-in duration-200"
      style={{ marginLeft: visualDepth > 0 ? `${20}px` : 0 }}
    >
      <div className="border border-brand/20 dark:border-brand/25 rounded-xl p-3 bg-brand/10 dark:bg-brand/10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Reply size={11} />
            <span>Replying to</span>
            <span className="font-semibold text-brand dark:text-brand">
              @{parentMessage.sender?.name || 'Anonymous'}
            </span>
          </div>
          <button
            onClick={onCancel}
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex gap-2.5">
          <Avatar className="w-7 h-7 shrink-0 mt-0.5">
            <AvatarImage src={currentUser.image || ''} />
            <AvatarFallback className="text-[9px] bg-brand/15 text-brand">
              {currentUser.name?.substring(0, 2).toUpperCase() || 'ME'}
            </AvatarFallback>
          </Avatar>
          <div ref={wrapRef} className={cn('t-input-wrap flex-1', error && 'is-error')}>
            <div className={cn('t-input', error && 'is-error')}>
              <Textarea
                ref={textareaRef}
                value={content}
                onChange={handleChange}
                placeholder="Write your reply…"
                className="min-h-[60px] max-h-[200px] text-sm resize-none shadow-none border-0 bg-transparent p-0 focus-visible:ring-0"
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
              />
            </div>

            <p className="t-error-msg text-[11px] text-red-500 mt-1">{error || 'Reply cannot be empty'}</p>

            <div className="flex items-center justify-end gap-2 mt-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancel}
                className="h-7 text-xs text-muted-foreground"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSubmitWithShake}
                disabled={isSubmitting || !content.trim()}
                className="h-7 text-xs bg-brand hover:bg-brand/90 text-white"
              >
                {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                {isSubmitting ? 'Posting...' : 'Reply'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

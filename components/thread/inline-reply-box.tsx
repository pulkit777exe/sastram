'use client';

import { useState, useEffect, useRef } from 'react';
import { Reply, X, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from 'next/navigation';
import { postMessage } from '@/modules/messages/actions';
import { toasts } from '@/lib/utils/toast';
import type { MessageNode } from '@/modules/messages/types';
import type { Message } from '@/lib/types/index';

const MAX_VISUAL_DEPTH = 4;

interface InlineReplyBoxProps {
  parentMessage: MessageNode;
  threadId: string;
  currentUser: {
    id: string;
    name: string | null;
    image: string | null;
  };
  visualDepth: number;
  onCancel: () => void;
  onMessagePosted: (message: Message) => void;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
}

export function InlineReplyBox({
  parentMessage,
  threadId,
  currentUser,
  visualDepth,
  onCancel,
  onMessagePosted,
  onTypingStart,
  onTypingStop,
}: InlineReplyBoxProps) {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const replyDepth = Math.min(parentMessage.depth + 1, MAX_VISUAL_DEPTH);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  async function handleSubmit() {
    if (!content.trim()) {
      setError('Reply cannot be empty');
      return;
    }
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append('content', content);
    formData.append('sectionId', threadId);
    formData.append('parentId', parentMessage.id);
    formData.append('depth', String(replyDepth));

    const result = await postMessage(formData);
    setIsSubmitting(false);

    if (result?.error) {
      setError(result.error);
    } else if (result?.data?.message) {
      const data = result.data.message;
      const newMsg: Message = {
        id: data?.id ?? crypto.randomUUID(),
        content: data?.content ?? content,
        sectionId: data?.sectionId ?? threadId,
        senderId: data?.senderId ?? currentUser.id,
        parentId: parentMessage.id,
        depth: data?.depth ?? replyDepth,
        isEdited: false,
        isPinned: false,
        likeCount: 0,
        replyCount: 0,
        isAiResponse: false,
        createdAt: data?.createdAt ? new Date(data.createdAt) : new Date(),
        updatedAt: data?.updatedAt ? new Date(data.updatedAt) : new Date(),
        deletedAt: null,
        sender: data?.sender
          ? {
              id: data.sender.id,
              name: data.sender.name,
              image: data.sender.image,
            }
          : {
              id: currentUser.id,
              name: currentUser.name,
              image: currentUser.image,
            },
        section: data?.section
          ? {
              id: data.section.id,
              name: data.section.name,
              slug: data.section.slug,
            }
          : { id: threadId, name: '', slug: '' },
        attachments:
          data?.attachments?.map(
            (att: { id: string; url: string; type: string; name: string | null; size: bigint | null }) => ({
              id: att.id,
              url: att.url,
              type: att.type,
              name: att.name,
              size: att.size !== null ? Number(att.size) : null,
            })
          ) ?? [],
      };

      onMessagePosted(newMsg);
      toasts.sent();
      router.refresh();
    }
  }

  return (
    <div
      className="mt-2 animate-in slide-in-from-top-1 fade-in duration-200"
      style={{ marginLeft: visualDepth > 0 ? `${20}px` : 0 }}
    >
      <div className="border border-indigo-200/50 dark:border-indigo-800/30 rounded-xl p-3 bg-indigo-50/30 dark:bg-indigo-950/10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Reply size={11} />
            <span>Replying to</span>
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">
              @{parentMessage.sender.name || 'Anonymous'}
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
            <AvatarFallback className="text-[9px] bg-indigo-100 text-indigo-600">
              {currentUser.name?.substring(0, 2).toUpperCase() || 'ME'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setError(null);
                onTypingStart?.();
              }}
              placeholder="Write your reply…"
              className="min-h-[60px] max-h-[200px] text-sm resize-none shadow-none border-0 bg-transparent p-0 focus-visible:ring-0"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleSubmit();
                  onTypingStop?.();
                }
                if (e.key === 'Escape') {
                  onCancel();
                  onTypingStop?.();
                } else {
                  onTypingStart?.();
                }
              }}
              onBlur={() => onTypingStop?.()}
            />

            {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}

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
                onClick={handleSubmit}
                disabled={isSubmitting || !content.trim()}
                className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
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
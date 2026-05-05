'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  PlusCircle,
  Gift,
  Smile,
  Sticker,
  Send,
  Loader2,
  FileIcon,
  X,
  MessageSquare,
} from 'lucide-react';
import { postMessage, searchMentionUsers } from '@/modules/messages/actions';
import { toasts } from '@/lib/utils/toast';
import { validateFile } from '@/lib/services/content-safety';
import type { Message } from '@/lib/types/index';

interface PostMessageFormProps {
  sectionId: string;
  onMessagePosted?: (message: Message) => void;
  replyTo?: {
    messageId: string;
    userName: string;
  } | null;
  onCancelReply?: () => void;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
}

type MentionCandidate = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  handle: string;
};

export function PostMessageForm({
  sectionId,
  onMessagePosted,
  replyTo,
  onCancelReply,
  onTypingStart,
  onTypingStop,
}: PostMessageFormProps) {
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [content, setContent] = useState('');
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [mentionCandidates, setMentionCandidates] = useState<MentionCandidate[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const mentionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mentionRequestIdRef = useRef(0);

  const closeMentions = useCallback(() => {
    setMentionOpen(false);
    setMentionCandidates([]);
    setActiveMentionIndex(0);
    setMentionStartIndex(null);
  }, []);

  useEffect(() => {
    return () => {
      if (mentionTimeoutRef.current) {
        clearTimeout(mentionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (mentionListRef.current?.contains(target) || textareaRef.current?.contains(target)) {
        return;
      }

      closeMentions();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [closeMentions]);

  const resolveMentionCandidates = useCallback(
    async (query: string) => {
      const requestId = ++mentionRequestIdRef.current;
      const result = await searchMentionUsers(sectionId, query);
      if (requestId !== mentionRequestIdRef.current) return;

      const users = Array.isArray(result.data) ? result.data : [];
      setMentionCandidates(users);
      setMentionOpen(users.length > 0);
      setActiveMentionIndex(0);
    },
    [sectionId]
  );

  const detectMentionQuery = useCallback(
    (value: string, caretIndex: number) => {
      const beforeCaret = value.slice(0, caretIndex);
      const match = beforeCaret.match(/(^|\s)@([\w.-]{1,50})$/);

      if (!match || !match[2]) {
        closeMentions();
        return;
      }

      const query = match[2];
      const atIndex = caretIndex - query.length - 1;
      setMentionStartIndex(atIndex);

      if (mentionTimeoutRef.current) {
        clearTimeout(mentionTimeoutRef.current);
      }

      mentionTimeoutRef.current = setTimeout(() => {
        void resolveMentionCandidates(query);
      }, 120);
    },
    [closeMentions, resolveMentionCandidates]
  );

  const applyMentionSelection = useCallback(
    (candidate: MentionCandidate) => {
      const textarea = textareaRef.current;
      if (!textarea || mentionStartIndex === null) return;

      const cursor = textarea.selectionStart ?? content.length;
      const before = content.slice(0, mentionStartIndex);
      const after = content.slice(cursor);
      const mentionToken = `@${candidate.handle}`;
      const nextContent = `${before}${mentionToken} ${after}`;

      setContent(nextContent);
      setMentionedUserIds((prev) => Array.from(new Set([...prev, candidate.id])));
      closeMentions();

      requestAnimationFrame(() => {
        const nextCursor = before.length + mentionToken.length + 1;
        textarea.focus();
        textarea.setSelectionRange(nextCursor, nextCursor);
      });
    },
    [content, mentionStartIndex, closeMentions]
  );

  async function handleSubmit(formData: FormData) {
    if (!content.trim()) {
      toasts.error('Message cannot be empty');
      return;
    }

    setLoading(true);
    formData.append('sectionId', sectionId);
    formData.set('content', content);

    if (selectedFile) {
      formData.append('fileName', selectedFile.name);
      formData.append('fileType', selectedFile.type);
      formData.append('fileSize', selectedFile.size.toString());
    }

    if (replyTo) {
      formData.append('parentId', replyTo.messageId);
    }

    if (mentionedUserIds.length > 0) {
      formData.append('mentions', JSON.stringify(mentionedUserIds));
    }

    const result = await postMessage(formData);
    setLoading(false);

    if (result?.error) {
      toasts.error(result.error);
    } else if (result?.data?.message) {
      formRef.current?.reset();
      setSelectedFile(null);
      setContent('');
      setMentionedUserIds([]);
      closeMentions();
      onCancelReply?.();

      if (onMessagePosted) {
        const transformedMessage = {
          ...result.data.message,
          attachments: result.data.message.attachments.map((att) => ({
            ...att,
            size: att.size !== null ? Number(att.size) : null,
          })),
        };
        onMessagePosted(transformedMessage);
      }

      if (result.data.aiInlineLimited) {
        toasts.aiInlineRateLimit();
      }
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateFile(file);
    if (!validation.isValid) {
      toasts.error(validation.error || 'Invalid file');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setSelectedFile(file);
  };

  const placeholder = replyTo ? `Reply to ${replyTo.userName}...` : 'Message #chat';

  return (
    <form ref={formRef} action={handleSubmit} className="relative px-4 pb-0 pt-0">
      {replyTo && (
        <div className="absolute -top-12 left-4 right-4 bg-[#2f3136] border border-[#202225] p-2 rounded-t-md text-sm flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#b9bbbe]">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Replying to</span>
            <span className="text-[#5865f2] font-medium">{replyTo.userName}</span>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="text-[#72767d] hover:text-[#dcddde] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {selectedFile && (
        <div
          className={`absolute ${replyTo ? '-top-24' : '-top-14'} left-4 bg-[#2f3136] border border-[#202225] p-2 rounded-md text-sm flex items-center gap-2 shadow-md`}
        >
          <FileIcon className="h-4 w-4 text-[#b9bbbe]" />
          <span className="truncate max-w-[200px] text-[#dcddde]">{selectedFile.name}</span>
          <button
            type="button"
            onClick={() => {
              setSelectedFile(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            className="ml-2 cursor-pointer text-[#72767d] hover:text-[#dcddde]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div
        className={`flex items-center rounded-lg p-0 pr-2 focus-within:ring-1 focus-within:ring-[#5865f2] transition-all ${
          replyTo ? 'border-t border-[#202225] rounded-t-none' : ''
        }`}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="hover:bg-transparent h-11 w-11 ml-1 shrink-0"
          onClick={() => fileInputRef.current?.click()}
        >
          <PlusCircle className="h-6 w-6" />
        </Button>

        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />

        <Textarea
          ref={textareaRef}
          name="content"
          placeholder={placeholder}
          value={content}
          onChange={(e) => {
            const nextValue = e.target.value;
            const caret = e.target.selectionStart ?? nextValue.length;
            setContent(nextValue);
            detectMentionQuery(nextValue, caret);
            onTypingStart?.();
          }}
          className="flex-1 min-h-11 max-h-[50vh] bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 resize-none py-3 px-2 text-base"
          onKeyDown={(e) => {
            if (mentionOpen && mentionCandidates.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveMentionIndex((prev) =>
                  prev + 1 >= mentionCandidates.length ? 0 : prev + 1
                );
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveMentionIndex((prev) =>
                  prev - 1 < 0 ? mentionCandidates.length - 1 : prev - 1
                );
                return;
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const selected = mentionCandidates[activeMentionIndex];
                if (selected) {
                  applyMentionSelection(selected);
                }
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                closeMentions();
                return;
              }
            }

            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              formRef.current?.requestSubmit();
              onTypingStop?.();
            } else if (e.key === 'Escape' && replyTo) {
              onCancelReply?.();
              closeMentions();
            } else {
              onTypingStart?.();
            }
          }}
          onBlur={() => onTypingStop?.()}
        />

        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hover:bg-transparent h-10 w-10"
          >
            <Gift className="h-6 w-6" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hover:bg-transparent h-10 w-10"
          >
            <Sticker className="h-6 w-6" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hover:bg-transparent h-10 w-10"
          >
            <Smile className="h-6 w-6" />
          </Button>
        </div>
      </div>

      {mentionOpen && mentionCandidates.length > 0 && (
        <div
          ref={mentionListRef}
          className="absolute bottom-14 left-16 z-20 w-[280px] rounded-md border border-border bg-background shadow-lg"
        >
          <div className="max-h-56 overflow-y-auto py-1">
            {mentionCandidates.map((candidate, index) => (
              <button
                key={candidate.id}
                type="button"
                className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                  index === activeMentionIndex
                    ? 'bg-muted text-foreground'
                    : 'hover:bg-muted/70 text-muted-foreground'
                }`}
                onMouseEnter={() => setActiveMentionIndex(index)}
                onClick={() => applyMentionSelection(candidate)}
              >
                <div className="font-medium text-foreground">
                  {candidate.name || candidate.email}
                </div>
                <div className="text-xs text-muted-foreground">@{candidate.handle}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="hidden">
        <Button type="submit" disabled={loading} className="rounded-md px-4 h-10 shadow-sm">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </Button>
      </div>
    </form>
  );
}

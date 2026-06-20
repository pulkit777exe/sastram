'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Paperclip,
  Bold,
  Italic,
  Code2,
  Link2,
  SmilePlus,
  AtSign,
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
import { InlinePollButton } from '@/components/thread/inline-poll-button';
import { MentionSuggest, type MentionCandidate } from '@/components/chat/mention-suggest';
import { cn } from '@/lib/utils/cn';

const COMMON_EMOJIS = [
  '😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆',
  '😉', '😊', '😋', '😎', '😍', '🥰', '😘', '😗',
  '👍', '👎', '👊', '✊', '🤝', '🙏', '💪', '🔥',
  '❤️', '💔', '💯', '✨', '⭐', '🌟', '💡', '🎉',
  '🎈', '🎁', '📌', '📍', '💬', '🗨️', '👀', '🙌',
  '🤔', '😤', '😢', '😭', '😱', '🤯', '🥳', '🤩',
];

interface PostMessageFormProps {
  threadId: string;
  onMessagePosted?: (message: Message) => void;
  onOptimisticMessage?: (message: Message) => void;
  onMessageError?: (tempId: string) => void;
  replyTo?: {
    messageId: string;
    userName: string;
  } | null;
  onCancelReply?: () => void;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
  canManagePoll?: boolean;
  onPollCreated?: (poll: { id: string; threadId: string; question: string; options: string[]; isActive: boolean; expiresAt: Date | null; createdAt: Date }) => void;
}

export function PostMessageForm({
  threadId,
  onMessagePosted,
  onOptimisticMessage,
  onMessageError,
  replyTo,
  onCancelReply,
  onTypingStart,
  onTypingStop,
  canManagePoll,
  onPollCreated,
}: PostMessageFormProps) {
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [content, setContent] = useState('');
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [mentionCandidates, setMentionCandidates] = useState<MentionCandidate[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [showPoll, setShowPoll] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
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

  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const emojiPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (mentionListRef.current?.contains(target) || textareaRef.current?.contains(target)) {
        return;
      }

      closeMentions();

      if (
        emojiOpen &&
        !emojiButtonRef.current?.contains(target) &&
        !emojiPanelRef.current?.contains(target)
      ) {
        setEmojiOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [closeMentions, emojiOpen]);

  const resolveMentionCandidates = useCallback(
    async (query: string) => {
      const requestId = ++mentionRequestIdRef.current;
      const result = await searchMentionUsers(threadId, query);
      if (requestId !== mentionRequestIdRef.current) return;

      const users = Array.isArray(result.data) ? result.data : [];
      setMentionCandidates(users);
      setMentionOpen(users.length > 0);
      setActiveMentionIndex(0);
    },
    [threadId]
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
      }, 300);
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

  const wrapSelection = useCallback(
    (before: string, after: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = content.substring(start, end);
      const next = content.slice(0, start) + before + selected + after + content.slice(end);
      setContent(next);
      requestAnimationFrame(() => {
        textarea.focus();
        const cursor = start + before.length;
        if (selected) {
          textarea.setSelectionRange(cursor, cursor + selected.length);
        } else {
          textarea.setSelectionRange(cursor, cursor);
        }
      });
    },
    [content]
  );

  const insertAtCursor = useCallback(
    (text: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const next = content.slice(0, start) + text + content.slice(textarea.selectionEnd);
      setContent(next);
      requestAnimationFrame(() => {
        textarea.focus();
        const cursor = start + text.length;
        textarea.setSelectionRange(cursor, cursor);
      });
    },
    [content]
  );

  const handleBold = useCallback(() => wrapSelection('**', '**'), [wrapSelection]);
  const handleItalic = useCallback(() => wrapSelection('*', '*'), [wrapSelection]);
  const handleCode = useCallback(() => wrapSelection('`', '`'), [wrapSelection]);
  const handleLink = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.substring(start, end);
    const url = window.prompt('Enter URL:', 'https://');
    if (!url) return;
    const linkText = selected || 'link';
    const next = content.slice(0, start) + '[' + linkText + '](' + url + ')' + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + next.length - (content.length - end));
    });
  }, [content]);

  const handleAtAi = useCallback(() => insertAtCursor('@ai '), [insertAtCursor]);

  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      insertAtCursor(emoji);
      setEmojiOpen(false);
    },
    [insertAtCursor]
  );

  async function handleSubmit(formData: FormData) {
    if (!content.trim()) {
      toasts.error('Message cannot be empty');
      return;
    }

    const messageContent = content;
    const tempId = `temp-${crypto.randomUUID()}`;

    // Build optimistic message
    const optimisticMessage: Message = {
      id: tempId,
      content: messageContent,
      threadId,
      senderId: '',
      parentId: replyTo?.messageId ?? null,
      depth: 0,
      isEdited: false,
      isPinned: false,
      likeCount: 0,
      replyCount: 0,
      isAiResponse: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      sender: { id: '', name: null, image: null },
      thread: { id: threadId, name: '', slug: '' },
      attachments: [],
    };

    // Optimistic: add message to UI immediately
    onOptimisticMessage?.(optimisticMessage);

    // Clear form immediately
    formRef.current?.reset();
    setSelectedFile(null);
    setContent('');
    setMentionedUserIds([]);
    closeMentions();
    onCancelReply?.();

    setLoading(true);
    formData.append('threadId', threadId);
    formData.set('content', messageContent);

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
      // Rollback: remove optimistic message
      onMessageError?.(tempId);
      toasts.error(result.error);
    } else if (result?.data?.message) {
      if (onMessagePosted) {
        const msg = result.data.message;
        const transformedMessage = {
          id: msg.id,
          content: msg.content,
          threadId: msg.threadId,
          senderId: msg.senderId,
          parentId: msg.parentId,
          depth: msg.depth,
          isEdited: false,
          isPinned: false,
          likeCount: 0,
          replyCount: 0,
          isAiResponse: false,
          createdAt: msg.createdAt,
          updatedAt: msg.updatedAt,
          deletedAt: null,
          sender: msg.sender ?? { id: msg.senderId, name: null, image: null },
          thread: msg.thread ?? { id: msg.threadId, name: '', slug: '' },
          attachments: msg.attachments?.map((att) => ({
            ...att,
            size: att.size !== null ? Number(att.size) : null,
          })) ?? [],
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

  const placeholder = replyTo
    ? `Reply to @${replyTo.userName}…`
    : 'Share your thoughts, ask questions, or @mention someone…';

  return (
    <form ref={formRef} action={handleSubmit} className="relative w-full">
      {replyTo && (
        <div className="absolute -top-11 left-0 right-0 bg-indigo-50 border-x border-t border-indigo-100 px-4 py-2 rounded-t-xl text-xs flex items-center justify-between z-10 animate-in slide-in-from-bottom-1 duration-150">
          <div className="flex items-center gap-2 text-indigo-700">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Replying to</span>
            <span className="font-semibold">@{replyTo.userName}</span>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="text-indigo-500 hover:text-indigo-700 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {selectedFile && (
        <div
          className={`absolute ${replyTo ? '-top-20' : '-top-11'} left-0 bg-muted/90 backdrop-blur border border-border px-3 py-1.5 rounded-t-xl text-xs flex items-center gap-2 shadow-sm z-10`}
        >
          <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="truncate max-w-[200px] text-foreground font-medium">{selectedFile.name}</span>
          <button
            type="button"
            onClick={() => {
              setSelectedFile(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            className="ml-1 cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div
        className={cn(
          "flex flex-col border border-border/80 rounded-2xl bg-card hover:border-indigo-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all shadow-sm overflow-hidden",
          replyTo && "rounded-t-none border-t-0"
        )}
      >
        {/* Top Tier: Textarea */}
        <div className="flex items-start px-4 pt-3 pb-1">
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
            className="flex-1 min-h-[44px] max-h-[30vh] bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 resize-none py-1.5 px-0 text-sm leading-relaxed placeholder-muted-foreground/60 text-foreground"
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
        </div>

        {/* Bottom Tier: Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 bg-muted/10 border-t border-border/40 select-none">
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4.5 w-4.5" />
            </Button>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />

            <div className="h-4 w-px bg-border/60 mx-1" />

            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg" onClick={handleBold}>
              <Bold className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg" onClick={handleItalic}>
              <Italic className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg" onClick={handleCode}>
              <Code2 className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg" onClick={handleLink}>
              <Link2 className="h-4 w-4" />
            </Button>

            <div className="h-4 w-px bg-border/60 mx-1" />

            <div className="relative">
              <Button ref={emojiButtonRef} type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg" onClick={() => setEmojiOpen((p) => !p)}>
                <SmilePlus className="h-4 w-4" />
              </Button>
              {emojiOpen && (
                <div ref={emojiPanelRef} className="absolute bottom-10 left-0 z-30 w-72 rounded-xl border border-border/80 bg-popover p-2.5 shadow-xl">
                  <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
                    {COMMON_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="hover:bg-muted rounded p-1.5 text-lg leading-none transition-colors text-center"
                        onClick={() => handleEmojiSelect(emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg" onClick={handleAtAi}>
              <AtSign className="h-4 w-4" />
            </Button>

            <div className="flex items-center gap-0.5">
              <InlinePollButton onClick={() => setShowPoll(true)} disabled={!canManagePoll} />
            </div>
          </div>

          <Button type="submit" disabled={loading || !content.trim()} size="sm" className="h-8 rounded-xl px-3 flex items-center gap-1.5 shadow-sm font-semibold transition-all">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            <span>Send</span>
          </Button>
        </div>
      </div>

      <MentionSuggest
        open={mentionOpen}
        candidates={mentionCandidates}
        activeIndex={activeMentionIndex}
        onSelect={applyMentionSelection}
        onHover={setActiveMentionIndex}
        listRef={mentionListRef}
      />
    </form>
  );
}

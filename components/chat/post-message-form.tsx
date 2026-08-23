'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import {
  Paperclip,
  SmilePlus,
  AtSign,
  Send,
  Loader2,
  FileIcon,
  X,
  MessageSquare,
} from 'lucide-react';
import { useMessageComposer } from '@/hooks/chat/use-message-composer';
import type { AiInlineMeta, Message } from '@/lib/types/index';
import { MentionSuggest } from '@/components/chat/mention-suggest';
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
  currentUser?: {
    id: string;
    name: string;
    image: string | null;
    role?: string;
  };
  onMessagePosted?: (message: Message, meta?: AiInlineMeta) => void;
  onOptimisticMessage?: (message: Message) => void;
  onMessageError?: (tempId: string) => void;
  aiClientStream?: boolean;
  replyTo?: {
    messageId: string;
    userName: string;
  } | null;
  onCancelReply?: () => void;
  canManagePoll?: boolean;
  showPoll?: boolean;
  onTogglePoll?: (show: boolean) => void;
  onPollCreated?: (poll: { id: string; threadId: string; question: string; options: string[]; isActive: boolean; expiresAt: Date | null; createdAt: Date }) => void;
}

export function PostMessageForm({
  threadId,
  currentUser,
  onMessagePosted,
  onOptimisticMessage,
  onMessageError,
  aiClientStream,
  replyTo,
  onCancelReply,
  canManagePoll,
  showPoll: showPollProp,
  onTogglePoll,
  onPollCreated,
}: PostMessageFormProps) {
  const [showPollLocal, setShowPollLocal] = useState(false);
  const showPoll = showPollProp ?? showPollLocal;
  const setShowPoll = onTogglePoll ?? setShowPollLocal;
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);

  const {
    content,
    selectedFile,
    setSelectedFile,
    handleFileSelect,
    fileInputRef,
    handleBold,
    handleItalic,
    handleCode,
    handleLink,
    mentionedUserIds,
    mentionCandidates,
    mentionOpen,
    activeMentionIndex,
    setActiveMentionIndex,
    applyMentionSelection,
    closeMentions,
    mentionListRef,
    handleEmojiSelect,
    handleAtSai,
    handleSubmit,
    isSubmitting,
    canSubmit,
    textareaRef,
    handleKeyDown,
    handleChange,
    handleBlur,
  } = useMessageComposer({
    threadId,
    replyTo,
    onMessagePosted,
    onOptimisticMessage,
    onMessageError,
    onCancelReply,
    currentUser,
    aiClientStream,
  });

  const formRef = useRef<HTMLFormElement>(null);
  const emojiButtonRef = useRef<HTMLDivElement>(null);
  const emojiPanelRef = useRef<HTMLDivElement>(null);
  const formatButtonRef = useRef<HTMLDivElement>(null);
  const formatPanelRef = useRef<HTMLDivElement>(null);

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

      if (
        formatOpen &&
        !formatButtonRef.current?.contains(target) &&
        !formatPanelRef.current?.contains(target)
      ) {
        setFormatOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [closeMentions, emojiOpen, formatOpen, mentionListRef, textareaRef]);

  const handleEmojiSelectAndClose = useCallback(
    (emoji: string) => {
      handleEmojiSelect(emoji);
      setEmojiOpen(false);
    },
    [handleEmojiSelect]
  );

  const placeholder = replyTo
    ? `Reply to @${replyTo.userName}…`
    : 'Share your thoughts, ask questions, or @mention someone…';

  return (
    <form ref={formRef} onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }} className="relative w-full">
      {replyTo && (
        <div className="absolute -top-11 left-0 right-0 bg-brand/10 border-x border-t border-brand/15 px-4 py-2 rounded-t-card text-xs flex items-center justify-between z-10 animate-in slide-in-from-bottom-1 duration-150">
          <div className="flex items-center gap-2 text-brand">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Replying to</span>
            <span className="font-semibold">@{replyTo.userName}</span>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="text-brand hover:text-brand transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {selectedFile && (
        <div
          className={`absolute ${replyTo ? '-top-20' : '-top-11'} left-0 bg-muted/90 backdrop-blur border border-border px-3 py-1.5 rounded-t-card text-xs flex items-center gap-2 shadow-linear-sm z-10`}
        >
          <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="truncate max-w-50 text-foreground font-medium">{selectedFile.name}</span>
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
          "flex flex-col border border-line rounded-card bg-surface hover:border-brand/20 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 transition-all shadow-card overflow-hidden",
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
            onChange={handleChange}
            className="flex-1 min-h-11 max-h-[30vh] bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 resize-none py-1.5 px-0 text-sm leading-relaxed placeholder-muted-foreground/60 text-foreground"
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
          />
        </div>

        {/* Bottom Tier: Toolbar */}
        <div className="flex items-center justify-between px-2 sm:px-3 py-2 bg-muted/10 border-t border-line/40 select-none">
          <div className="flex items-center gap-0.5 sm:gap-1">
            <button
              type="button"
              className="h-8 w-8 min-h-11 min-w-11 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4.5 w-4.5" />
            </button>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />

            <div className="relative">
              <div ref={emojiButtonRef}>
                <button type="button" className="h-8 w-8 min-h-11 min-w-11 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg" onClick={() => setEmojiOpen((p) => !p)}>
                  <SmilePlus className="h-4 w-4" />
                </button>
              </div>
              {emojiOpen && (
                <div ref={emojiPanelRef} className="absolute bottom-10 left-0 z-30 w-72 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface p-2.5 shadow-overlay">
                  <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
                    {COMMON_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="hover:bg-muted rounded p-1.5 text-lg leading-none transition-colors text-center"
                        onClick={() => handleEmojiSelectAndClose(emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button type="button" className="h-8 w-8 min-h-11 min-w-11 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg" onClick={handleAtSai}>
              <AtSign className="h-4 w-4" />
            </button>

            <div className="relative">
              <div ref={formatButtonRef}>
                <button
                  type="button"
                  className="h-8 w-8 min-h-11 min-w-11 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
                  onClick={() => setFormatOpen((o) => !o)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 7V4h16v3" />
                    <path d="M9 20h6" />
                    <path d="M12 4v16" />
                  </svg>
                </button>
              </div>
              {formatOpen && (
                <div ref={formatPanelRef} className="absolute bottom-10 left-0 z-30 w-36 rounded-card border border-line bg-surface p-1 shadow-overlay">
                  <button
                    type="button"
                    onClick={() => { handleBold(); setFormatOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left text-sm text-foreground hover:bg-hover transition-colors"
                  >
                    Bold
                  </button>
                  <button
                    type="button"
                    onClick={() => { handleItalic(); setFormatOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left text-sm text-foreground hover:bg-hover transition-colors"
                  >
                    Italic
                  </button>
                  <button
                    type="button"
                    onClick={() => { handleCode(); setFormatOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left text-sm text-foreground hover:bg-hover transition-colors"
                  >
                    Code
                  </button>
                  <button
                    type="button"
                    onClick={() => { handleLink(); setFormatOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left text-sm text-foreground hover:bg-hover transition-colors"
                  >
                    Link
                  </button>
                  {canManagePoll && (
                    <button
                      type="button"
                      onClick={() => { setShowPoll(true); setFormatOpen(false); }}
                      className="flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left text-sm text-foreground hover:bg-hover transition-colors"
                    >
                      Poll
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <button type="submit" disabled={isSubmitting || !canSubmit} className="h-8 !w-8 !p-0 flex items-center justify-center !rounded-lg shadow-linear-sm font-semibold transition-all">
            {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
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

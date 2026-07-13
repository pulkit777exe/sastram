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
import { useMessageComposer } from '@/hooks/chat/use-message-composer';
import type { Message } from '@/lib/types/index';
import { InlinePollButton } from '@/components/thread/inline-poll-button';
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
  onMessagePosted?: (message: Message) => void;
  onOptimisticMessage?: (message: Message) => void;
  onMessageError?: (tempId: string) => void;
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
    handleAtAi,
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
  });

  const formRef = useRef<HTMLFormElement>(null);
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
  }, [closeMentions, emojiOpen, mentionListRef, textareaRef]);

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
        <div className="absolute -top-11 left-0 right-0 bg-brand/10 border-x border-t border-brand/15 px-4 py-2 rounded-t-xl text-xs flex items-center justify-between z-10 animate-in slide-in-from-bottom-1 duration-150">
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
          className={`absolute ${replyTo ? '-top-20' : '-top-11'} left-0 bg-muted/90 backdrop-blur border border-border px-3 py-1.5 rounded-t-xl text-xs flex items-center gap-2 shadow-linear-sm z-10`}
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
          "flex flex-col border border-border/80 rounded-2xl bg-card hover:border-brand/20 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 transition-all shadow-linear-sm overflow-hidden",
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
            className="flex-1 min-h-[44px] max-h-[30vh] bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 resize-none py-1.5 px-0 text-sm leading-relaxed placeholder-muted-foreground/60 text-foreground"
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
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
                <div ref={emojiPanelRef} className="absolute bottom-10 left-0 z-30 w-72 rounded-xl border border-border/80 bg-popover p-2.5 shadow-linear-xl">
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

            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg" onClick={handleAtAi}>
              <AtSign className="h-4 w-4" />
            </Button>

            <div className="flex items-center gap-0.5">
              <InlinePollButton onClick={() => setShowPoll(true)} disabled={!canManagePoll} />
            </div>
          </div>

          <Button type="submit" disabled={isSubmitting || !content.trim()} size="sm" className="h-8 rounded-xl px-3 flex items-center gap-1.5 shadow-linear-sm font-semibold transition-all">
            {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
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

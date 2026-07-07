'use client';

import { useCallback, useState } from 'react';
import { Loader2, PlusCircle, FileIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useMessageComposer } from '@/hooks/chat/use-message-composer';

interface ReplyBoxProps {
  threadId: string;
  parentId?: string;
  onSuccess?: () => void;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
}

export default function ReplyBox({
  threadId,
  parentId,
  onSuccess,
  onTypingStart,
  onTypingStop,
}: ReplyBoxProps) {
  const [isAiLoading, setIsAiLoading] = useState(false);

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
    handleAtAi,
    handleSubmit,
    isSubmitting,
    error,
    canSubmit,
    textareaRef,
    handleKeyDown,
    handleChange,
    handleBlur,
  } = useMessageComposer({
    threadId,
    parentId,
    onSuccess,
    onTypingStart,
    onTypingStop,
  });

  const handleAiReply = useCallback(async () => {
    if (isAiLoading) return;
    setIsAiLoading(true);

    try {
      await fetch(`/api/threads/${threadId}/ai-reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          threadId,
        }),
      });
    } finally {
      setIsAiLoading(false);
    }
  }, [isAiLoading, threadId]);

  return (
    <div className="flex flex-col gap-3">
      {/* File preview */}
      {selectedFile && (
        <div className="flex items-center gap-2 p-2 bg-muted rounded-lg text-sm">
          <FileIcon className="h-4 w-4 text-muted-foreground-foreground" />
          <span className="truncate flex-1">{selectedFile.name}</span>
          <button
            type="button"
            onClick={() => {
              setSelectedFile(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            className="text-muted-foreground-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="font-(--font-dm-mono) text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          Reply
        </span>
      </div>

      <div className="rounded-[12px] border border-border bg-(--surface) p-3">
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-[6px] px-2 py-1 text-[12px] text-muted-foreground hover:bg-(--blue-dim) hover:text-(--text)"
          >
            <PlusCircle className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleBold}
            className="rounded-[6px] px-2 py-1 text-[12px] text-muted-foreground hover:bg-(--blue-dim) hover:text-(--text)"
          >
            **B**
          </button>
          <button
            type="button"
            onClick={handleItalic}
            className="rounded-[6px] px-2 py-1 text-[12px] text-muted-foreground hover:bg-(--blue-dim) hover:text-(--text)"
          >
            *I*
          </button>
          <button
            type="button"
            onClick={handleCode}
            className="rounded-[6px] px-2 py-1 text-[12px] text-muted-foreground hover:bg-(--blue-dim) hover:text-(--text)"
          >
            {'</>'}
          </button>
          <button
            type="button"
            onClick={handleLink}
            className="rounded-[6px] px-2 py-1 text-[12px] text-muted-foreground hover:bg-(--blue-dim) hover:text-(--text)"
          >
            Link
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handleAiReply}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-[999px] border border-border px-2.5 py-1 text-[12px] font-medium',
                'text-(--blue) hover:bg-(--blue-dim)'
              )}
              disabled={isAiLoading}
            >
              {isAiLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>@ai</span>
            </button>
          </div>
        </div>

        {/* File input */}
        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />

        <textarea
          id="thread-reply-box"
          value={content}
          onChange={handleChange}
          onKeyDown={(e) => {
            handleKeyDown(e);
            if (e.key === 'Enter' && !e.shiftKey) {
              onTypingStop?.();
            }
          }}
          onBlur={handleBlur}
          placeholder="Add your reply. Press Ctrl+Enter or Cmd+Enter to submit."
          className="min-h-20 w-full resize-none border-0 bg-transparent text-[14px] leading-normal text-(--text) outline-none"
        />

        <div className="mt-2 flex items-center justify-between">
          {error ? (
            <span className="text-[12px] text-(--red)">{error}</span>
          ) : (
            <span className="text-[11px] text-muted-foreground">Markdown-style formatting is supported.</span>
          )}

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit || isSubmitting}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[12px] font-medium',
              canSubmit
                ? 'bg-(--blue) text-white hover:opacity-90'
                : 'bg-(--blue-dim) text-muted-foreground cursor-not-allowed'
            )}
          >
            {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Post reply</span>
          </button>
        </div>
      </div>
    </div>
  );
}

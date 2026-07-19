'use client';

import { Loader2, PlusCircle, FileIcon, X, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useMessageComposer } from '@/hooks/chat/use-message-composer';
import { MentionSuggest } from '@/components/chat/mention-suggest';

interface ReplyBoxProps {
  threadId: string;
  parentId?: string;
  onSuccess?: () => void;
}

export default function ReplyBox({
  threadId,
  parentId,
  onSuccess,
}: ReplyBoxProps) {
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
    handleAtSai,
    handleSubmit,
    isSubmitting,
    error,
    canSubmit,
    textareaRef,
    handleKeyDown,
    handleChange,
    handleBlur,
    detectMentionQuery,
    // Mentions
    mentionCandidates,
    mentionOpen,
    activeMentionIndex,
    applyMentionSelection,
    setActiveMentionIndex,
    mentionListRef,
    // Poll Builder
    showPollBuilder,
    setShowPollBuilder,
    pollQuestion,
    setPollQuestion,
    pollOptions,
    setPollOptions,
  } = useMessageComposer({
    threadId,
    parentId,
    onSuccess,
  });

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

      {/* Inline Poll Builder */}
      {showPollBuilder && (
        <div className="rounded-[12px] border border-border/80 bg-muted/30 p-4 space-y-3 relative overflow-hidden transition-all duration-300">
          <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-2">
            <span className="font-(--font-dm-mono) text-[11px] uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5 text-(--blue)" />
              Create Inline Poll
            </span>
            <button
              type="button"
              onClick={() => {
                setShowPollBuilder(false);
                setPollQuestion('');
                setPollOptions(['', '']);
              }}
              className="text-muted-foreground hover:text-foreground p-1 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Ask a question..."
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              className="w-full bg-transparent border-b border-border/60 focus:border-(--blue) py-1.5 text-[13px] outline-none text-(--text) placeholder-muted-foreground/60 transition-colors"
            />
            <div className="space-y-2">
              {pollOptions.map((option, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground/80 font-(--font-dm-mono) w-4">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    placeholder={`Option ${idx + 1}...`}
                    value={option}
                    onChange={(e) => {
                      const newOpts = [...pollOptions];
                      newOpts[idx] = e.target.value;
                      setPollOptions(newOpts);
                    }}
                    className="flex-1 bg-transparent border-b border-border/40 focus:border-border py-1 text-[13px] outline-none text-(--text) placeholder-muted-foreground/50 transition-colors"
                  />
                  {pollOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => {
                        const newOpts = pollOptions.filter((_, i) => i !== idx);
                        setPollOptions(newOpts);
                      }}
                      className="text-muted-foreground/50 hover:text-red-500 p-1"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 10 && (
                <button
                  type="button"
                  onClick={() => setPollOptions([...pollOptions, ''])}
                  className="text-[12px] text-(--blue) hover:underline pl-6 pt-1 font-medium transition-all block"
                >
                  + Add option
                </button>
              )}
            </div>
          </div>
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
            title="Attach a file"
            className="rounded-[6px] px-2 py-1 text-[12px] text-muted-foreground hover:bg-(--blue-dim) hover:text-(--text)"
          >
            <PlusCircle className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowPollBuilder(!showPollBuilder)}
            title="Create an inline poll"
            className={cn(
              "rounded-[6px] px-2 py-1 text-[12px] transition-colors",
              showPollBuilder
                ? "bg-(--blue-dim) text-(--blue)"
                : "text-muted-foreground hover:bg-(--blue-dim) hover:text-(--text)"
            )}
          >
            <BarChart3 className="h-4 w-4" />
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
              onClick={handleAtSai}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-[999px] border border-border px-2.5 py-1 text-[12px] font-medium',
                'text-(--blue) hover:bg-(--blue-dim)'
              )}
            >
              <span>@sai</span>
            </button>
          </div>
        </div>

        {/* File input */}
        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />

          <textarea
            id="thread-reply-box"
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              handleChange(e);
              detectMentionQuery(e.target.value, e.target.selectionStart ?? e.target.value.length);
            }}
            onKeyDown={(e) => {
              handleKeyDown(e);
            }}
            onBlur={handleBlur}
            placeholder="Add your reply. Use @ to mention someone. Press Ctrl+Enter or Cmd+Enter to submit."
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

        <MentionSuggest
          open={mentionOpen}
          candidates={mentionCandidates}
          activeIndex={activeMentionIndex}
          onSelect={applyMentionSelection}
          onHover={setActiveMentionIndex}
          listRef={mentionListRef}
        />
    </div>
  );
}

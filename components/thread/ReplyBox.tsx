"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface ReplyBoxProps {
  threadId: string;
  parentId?: string;
  onSuccess?: () => void;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
}

type ToolbarAction = "bold" | "italic" | "code" | "link";

export default function ReplyBox({
  threadId,
  parentId,
  onSuccess,
  onTypingStart,
  onTypingStop,
}: ReplyBoxProps) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const canSubmit = useMemo(() => value.trim().length > 0, [value]);

  const applyInlineFormat = useCallback((action: ToolbarAction) => {
    const textarea = document.getElementById(
      "thread-reply-box",
    ) as HTMLTextAreaElement | null;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);

    let wrapped = selected;
    if (action === "bold") wrapped = `**${selected || "bold text"}**`;
    if (action === "italic") wrapped = `*${selected || "italic text"}*`;
    if (action === "code") wrapped = `\`${selected || "code"}\``;
    if (action === "link") wrapped = `[${selected || "link text"}](https://)`;

    const next =
      value.slice(0, start) + wrapped + value.slice(end, value.length);
    setValue(next);

    requestAnimationFrame(() => {
      textarea.focus();
      const caret = start + wrapped.length;
      textarea.setSelectionRange(caret, caret);
    });
  }, [value]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          threadId,
          parentId: parentId ?? null,
          body: value.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Failed to post message");
      }

      setValue("");
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again.",
      );
    } finally {
      setIsSubmitting(false);
      router.refresh();
    }
  }, [canSubmit, isSubmitting, threadId, parentId, value, onSuccess, router]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        handleSubmit();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSubmit]);

  const handleAiReply = async () => {
    if (isAiLoading) return;
    setIsAiLoading(true);

    try {
      await fetch(`/api/threads/${threadId}/ai-reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          threadId,
        }),
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex items-center justify-between">
        <span className="font-(--font-dm-mono) text-[11px] uppercase tracking-[0.12em] text-muted">
          Reply
        </span>
      </div>

      <div className="rounded-[12px] border border-border bg-(--surface) p-[12px]">
        <div className="mb-[8px] flex items-center gap-[8px]">
          <button
            type="button"
            onClick={() => applyInlineFormat("bold")}
            className="rounded-[6px] px-[8px] py-[4px] text-[12px] text-muted hover:bg-(--blue-dim) hover:text-(--text)"
          >
            **B**
          </button>
          <button
            type="button"
            onClick={() => applyInlineFormat("italic")}
            className="rounded-[6px] px-[8px] py-[4px] text-[12px] text-muted hover:bg-(--blue-dim) hover:text-(--text)"
          >
            *I*
          </button>
          <button
            type="button"
            onClick={() => applyInlineFormat("code")}
            className="rounded-[6px] px-[8px] py-[4px] text-[12px] text-muted hover:bg-(--blue-dim) hover:text-(--text)"
          >
            {"</>"}
          </button>
          <button
            type="button"
            onClick={() => applyInlineFormat("link")}
            className="rounded-[6px] px-[8px] py-[4px] text-[12px] text-muted hover:bg-(--blue-dim) hover:text-(--text)"
          >
            Link
          </button>

          <div className="ml-auto flex items-center gap-[8px]">
            <button
              type="button"
              onClick={handleAiReply}
              className={cn(
                "inline-flex items-center gap-[6px] rounded-[999px] border border-border px-[10px] py-[4px] text-[12px] font-medium",
                "text-(--blue) hover:bg-(--blue-dim)",
              )}
              disabled={isAiLoading}
            >
              {isAiLoading && (
                <Loader2 className="h-[14px] w-[14px] animate-spin" />
              )}
              <span>@ai</span>
            </button>
          </div>
        </div>

        <textarea
          id="thread-reply-box"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
            onTypingStart?.();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
              onTypingStop?.();
            } else {
              onTypingStart?.();
            }
          }}
          onBlur={() => onTypingStop?.()}
          placeholder="Add your reply. Press Ctrl+Enter or Cmd+Enter to submit."
          className="min-h-[80px] w-full resize-none border-0 bg-transparent text-[14px] leading-normal text-(--text) outline-none"
        />

        <div className="mt-[8px] flex items-center justify-between">
          {error ? (
            <span className="text-[12px] text-(--red)">{error}</span>
          ) : (
            <span className="text-[11px] text-muted">
              Markdown-style formatting is supported.
            </span>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className={cn(
              "inline-flex items-center gap-[6px] rounded-[6px] px-[12px] py-[6px] text-[12px] font-medium",
              canSubmit
                ? "bg-(--blue) text-white hover:opacity-90"
                : "bg-(--blue-dim) text-muted cursor-not-allowed",
            )}
          >
            {isSubmitting && (
              <Loader2 className="h-[14px] w-[14px] animate-spin" />
            )}
            <span>Post reply</span>
          </button>
        </div>
      </div>
    </div>
  );
}


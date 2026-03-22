"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PlusCircle, FileIcon, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { toast } from "sonner";
import { validateFile } from "@/lib/services/content-safety";

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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = useMemo(() => value.trim().length > 0 || selectedFile, [value, selectedFile]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateFile(file);
    if (!validation.isValid) {
      toast.error(validation.error);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File size must be less than 10MB");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedFile(file);
  };

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

    const formData = new FormData();
    formData.append("threadId", threadId);
    formData.append("body", value.trim());
    if (parentId) formData.append("parentId", parentId);
    if (selectedFile) {
      formData.append("files", selectedFile);
    }

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || `Failed to post message: ${response.status}`);
      }

      setValue("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (onSuccess) onSuccess();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Something went wrong. Try again.";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
      router.refresh();
    }
  }, [canSubmit, isSubmitting, threadId, parentId, value, selectedFile, onSuccess, router]);

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
    <div className="flex flex-col gap-3">
      {/* File preview */}
      {selectedFile && (
        <div className="flex items-center gap-2 p-2 bg-muted rounded-lg text-sm">
          <FileIcon className="h-4 w-4 text-muted-foreground" />
          <span className="truncate flex-1">{selectedFile.name}</span>
          <button
            type="button"
            onClick={() => {
              setSelectedFile(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="font-(--font-dm-mono) text-[11px] uppercase tracking-[0.12em] text-muted">
          Reply
        </span>
      </div>

      <div className="rounded-[12px] border border-border bg-(--surface) p-3">
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-[6px] px-[8px] py-[4px] text-[12px] text-muted hover:bg-(--blue-dim) hover:text-(--text)"
          >
            <PlusCircle className="h-4 w-4" />
          </button>
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

        {/* File input */}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileSelect}
        />

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

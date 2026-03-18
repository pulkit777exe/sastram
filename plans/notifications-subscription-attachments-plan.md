# Notifications, Subscription, and Attachments Implementation Plan

## Overview
This plan covers the remaining tasks for the notifications, subscription, and attachments features.

## Tasks

### 1. Add update subscription frequency action
- Create an action in `modules/newsletter/actions.ts` to update subscription frequency
- Add a repository function in `modules/newsletter/repository.ts` to update the frequency in the database
- Define a schema for the update frequency input
- Implement error handling and revalidation

### 2. Wire frequency selector in subscribe-button.tsx to update frequency
- Modify `components/thread/subscribe-button.tsx` to call the update frequency action
- Add loading state for the frequency selector
- Handle errors and display feedback to the user

### 3. Add attachment functionality to ReplyBox.tsx
- Modify `components/thread/ReplyBox.tsx` to add file input
- Implement file validation using existing `validateFile` function
- Add file preview and removal functionality
- Modify the submit handler to include file data
- Ensure compatibility with existing message attachments

## Technical Details

### Subscription Frequency Update
```typescript
// modules/newsletter/repository.ts
export async function updateSubscriptionFrequency({
  threadId,
  userId,
  frequency,
}: {
  threadId: string;
  userId: string;
  frequency: DigestFrequency;
}) {
  return prisma.threadSubscription.update({
    where: {
      threadId_userId: {
        threadId,
        userId,
      },
    },
    data: {
      frequency,
    },
  });
}

// modules/newsletter/actions.ts
export async function updateSubscriptionFrequencyAction({
  threadId,
  frequency,
}: {
  threadId: string;
  frequency: DigestFrequency;
}) {
  const parsed = updateSubscriptionFrequencySchema.safeParse({ threadId, frequency });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { data: null, error: "Something went wrong" };
    }

    await updateSubscriptionFrequency({
      threadId: parsed.data.threadId,
      userId: session.user.id,
      frequency: parsed.data.frequency,
    });

    return { data: null, error: null };
  } catch (error) {
    console.error("[updateSubscriptionFrequencyAction]", error);
    return { data: null, error: "Something went wrong" };
  }
}
```

### ReplyBox Attachment Functionality
```typescript
// components/thread/ReplyBox.tsx
import { PlusCircle, FileIcon, X } from "lucide-react";
import { validateFile } from "@/lib/services/content-safety";

// Add state for selected file
const [selectedFile, setSelectedFile] = useState<File | null>(null);
const fileInputRef = useRef<HTMLInputElement>(null);

// Handle file selection
const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const validation = validateFile(file);
  if (!validation.isValid) {
    toast.error(validation.error);
    if (fileInputRef.current) fileInputRef.current.value = "";
    return;
  }

  setSelectedFile(file);
};

// Modify submit handler to include file data
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
      throw new Error(data?.error || "Failed to post message");
    }

    const result = await response.json();
    setValue("");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (onSuccess) onSuccess();
  } catch (err) {
    setError(
      err instanceof Error ? err.message : "Something went wrong. Try again.",
    );
  } finally {
    setIsSubmitting(false);
    router.refresh();
  }
}, [canSubmit, isSubmitting, threadId, parentId, value, selectedFile, onSuccess, router]);

// Render file preview and file input
return (
  <div className="flex flex-col gap-[12px]">
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

    {/* Reply box content */}
    <div className="rounded-[12px] border border-border bg-(--surface) p-[12px]">
      <div className="mb-[8px] flex items-center gap-[8px]">
        {/* Formatting buttons */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-[6px] px-[8px] py-[4px] text-[12px] text-muted hover:bg-(--blue-dim) hover:text-(--text)"
        >
          <PlusCircle className="h-4 w-4" />
        </button>
        {/* Other formatting buttons */}
      </div>

      {/* File input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Textarea */}
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

      {/* Submit button */}
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
```

## Dependencies
- Existing `validateFile` function in `@/lib/services/content-safety`
- Existing message API endpoint in `/api/messages`
- Prisma schema with `ThreadSubscription` model

## Testing
- Test subscription frequency update
- Test ReplyBox attachment functionality
- Test notifications and live count
- Test typing indicators

## Delivery Timeline
- [ ] Task 1: Add update subscription frequency action - 1 day
- [ ] Task 2: Wire frequency selector in subscribe-button.tsx to update frequency - 0.5 days
- [ ] Task 3: Add attachment functionality to ReplyBox.tsx - 1 day

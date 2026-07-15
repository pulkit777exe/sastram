'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toasts } from '@/lib/utils/toast';
import { validateFile } from '@/lib/services/content-safety';
import { postMessage, searchMentionUsers } from '@/modules/messages/actions';
import type { Message } from '@/lib/types/index';
import type { MentionCandidate } from '@/components/chat/mention-suggest';

type ToolbarAction = 'bold' | 'italic' | 'code' | 'link';

interface UseMessageComposerOptions {
  threadId: string;
  parentId?: string;
  depth?: number;
  replyTo?: {
    messageId: string;
    userName: string;
  } | null;
  currentUser?: {
    id: string;
    name: string;
    image: string | null;
  };
  onMessagePosted?: (message: Message) => void;
  onOptimisticMessage?: (message: Message) => void;
  onMessageError?: (tempId: string) => void;
  onSuccess?: () => void;
  onCancelReply?: () => void;
}

interface UseMessageComposerReturn {
  // Content
  content: string;
  setContent: (value: string) => void;

  // File
  selectedFile: File | null;
  setSelectedFile: (file: File | null) => void;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;

  // Markdown toolbar
  handleBold: () => void;
  handleItalic: () => void;
  handleCode: () => void;
  handleLink: () => void;

  // @mentions
  mentionedUserIds: string[];
  mentionCandidates: MentionCandidate[];
  mentionOpen: boolean;
  activeMentionIndex: number;
  setActiveMentionIndex: (index: number) => void;
  detectMentionQuery: (value: string, caretIndex: number) => void;
  applyMentionSelection: (candidate: MentionCandidate) => void;
  closeMentions: () => void;
  mentionListRef: React.RefObject<HTMLDivElement | null>;

  // Emoji
  handleEmojiSelect: (emoji: string) => void;
  insertAtCursor: (text: string) => void;

  // @sai
  handleAtSai: () => void;

  // Submit
  handleSubmit: (formData?: FormData) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
  canSubmit: boolean;

  // Textarea
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handleChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleBlur: () => void;

  // Cleanup
  cleanup: () => void;
}

export function useMessageComposer(options: UseMessageComposerOptions): UseMessageComposerReturn {
  const {
    threadId,
    parentId,
    depth = 0,
    replyTo,
    currentUser,
    onMessagePosted,
    onOptimisticMessage,
    onMessageError,
    onSuccess,
    onCancelReply,
  } = options;

  // Content
  const [content, setContent] = useState('');

  // File
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Loading/error
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mentions
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [mentionCandidates, setMentionCandidates] = useState<MentionCandidate[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const mentionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mentionRequestIdRef = useRef(0);
  const mentionListRef = useRef<HTMLDivElement>(null);

  // Textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const closeMentions = useCallback(() => {
    setMentionOpen(false);
    setMentionCandidates([]);
    setActiveMentionIndex(0);
    setMentionStartIndex(null);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (mentionTimeoutRef.current) {
        clearTimeout(mentionTimeoutRef.current);
      }
    };
  }, []);

  // --- @mentions ---
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

  // --- Text manipulation helpers ---
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

  // --- Toolbar ---
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

  const handleAtSai = useCallback(() => insertAtCursor('@sai '), [insertAtCursor]);

  // --- Emoji ---
  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      insertAtCursor(emoji);
    },
    [insertAtCursor]
  );

  // --- File ---
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateFile(file);
    if (!validation.isValid) {
      toasts.error(validation.error || 'Invalid file');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setSelectedFile(file);
  }, []);

  // --- Submit ---
  const handleSubmit = useCallback(
    async (formData?: FormData) => {
      if (!content.trim() && !selectedFile) {
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
        senderId: currentUser?.id ?? '',
        parentId: parentId ?? replyTo?.messageId ?? null,
        depth,
        isEdited: false,
        isPinned: false,
        likeCount: 0,
        replyCount: 0,
        isAiResponse: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        sender: { id: currentUser?.id ?? '', name: currentUser?.name || 'You', image: currentUser?.image ?? null },
        thread: { id: threadId, name: '', slug: '' },
        attachments: [],
      };

      // Optimistic: add message to UI immediately
      onOptimisticMessage?.(optimisticMessage);

      // Clear form immediately
      setContent('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setMentionedUserIds([]);
      closeMentions();
      onCancelReply?.();

      setIsSubmitting(true);
      setError(null);

      // Build FormData
      const data = formData ?? new FormData();
      data.set('threadId', threadId);
      data.set('content', messageContent);
      if (parentId) data.set('parentId', parentId);
      if (replyTo && !parentId) data.set('parentId', replyTo.messageId);

      // Upload file if selected, then include attachment metadata
      if (selectedFile) {
        try {
          const uploadFormData = new FormData();
          uploadFormData.append('files', selectedFile);
          const uploadResponse = await fetch('/api/upload', { method: 'POST', body: uploadFormData });
          if (uploadResponse.ok) {
            const uploadData = await uploadResponse.json();
            const uploadedFile = uploadData?.data?.files?.[0];
            if (uploadedFile?.url) {
              data.append(
                'attachments',
                JSON.stringify([
                  {
                    url: uploadedFile.url,
                    type: uploadedFile.type,
                    name: uploadedFile.name,
                    size: uploadedFile.size,
                  },
                ])
              );
            }
          } else {
            toasts.error('Failed to upload file');
            setIsSubmitting(false);
            onMessageError?.(tempId);
            return;
          }
        } catch {
          toasts.error('Failed to upload file');
          setIsSubmitting(false);
          onMessageError?.(tempId);
          return;
        }
      }

      if (mentionedUserIds.length > 0) {
        data.append('mentions', JSON.stringify(mentionedUserIds));
      }

      const result = await postMessage(data);
      setIsSubmitting(false);

      if (result?.error) {
        onMessageError?.(tempId);
        setError(result.error);
        toasts.error(result.error);
      } else if (result?.data?.message) {
        const msg = result.data.message;
        const transformedMessage: Message = {
          id: msg.id,
          content: msg.content,
          threadId: msg.threadId,
          senderId: msg.senderId ?? currentUser?.id ?? '',
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
          sender: msg.sender ?? { id: msg.senderId ?? currentUser?.id ?? '', name: null, image: null },
          thread: msg.thread ?? { id: msg.threadId, name: '', slug: '' },
          attachments:
            msg.attachments?.map((att: { id: string; url: string; type: string; name: string | null; size: bigint | null }) => ({
              ...att,
              size: att.size !== null ? Number(att.size) : null,
            })) ?? [],
        };
        onMessagePosted?.(transformedMessage);
        onSuccess?.();

        if (result.data.aiInlineLimited) {
          toasts.aiInlineRateLimit();
        }
      }
    },
    [
      content,
      selectedFile,
      threadId,
      parentId,
      replyTo,
      depth,
      currentUser,
      mentionedUserIds,
      onOptimisticMessage,
      onMessagePosted,
      onMessageError,
      onSuccess,
      onCancelReply,
      closeMentions,
    ]
  );

  // --- Keyboard ---
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Mention navigation
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

      // Submit on Cmd/Ctrl+Enter (always) or Enter (default)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      } else if (e.key === 'Escape' && replyTo) {
        onCancelReply?.();
        closeMentions();
      }
    },
    [
      mentionOpen,
      mentionCandidates,
      activeMentionIndex,
      applyMentionSelection,
      closeMentions,
      handleSubmit,
      replyTo,
      onCancelReply,
    ]
  );

  // --- Change / Blur ---
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = e.target.value;
      const caret = e.target.selectionStart ?? nextValue.length;
      setContent(nextValue);
      detectMentionQuery(nextValue, caret);
    },
    [detectMentionQuery]
  );

  const handleBlur = useCallback(() => {
    // no-op: typing indicators removed
  }, []);

  // --- Cleanup ---
  const cleanup = useCallback(() => {
    if (mentionTimeoutRef.current) {
      clearTimeout(mentionTimeoutRef.current);
    }
  }, []);

  // --- canSubmit ---
  const canSubmit = useMemo(() => content.trim().length > 0 || !!selectedFile, [content, selectedFile]);

  return {
    // Content
    content,
    setContent,

    // File
    selectedFile,
    setSelectedFile,
    handleFileSelect,
    fileInputRef,

    // Toolbar
    handleBold,
    handleItalic,
    handleCode,
    handleLink,

    // Mentions
    mentionedUserIds,
    mentionCandidates,
    mentionOpen,
    activeMentionIndex,
    setActiveMentionIndex,
    detectMentionQuery,
    applyMentionSelection,
    closeMentions,
    mentionListRef,

    // Emoji
    handleEmojiSelect,
    insertAtCursor,

    // @sai
    handleAtSai,

    // Submit
    handleSubmit,
    isSubmitting,
    error,
    canSubmit,

    // Textarea
    textareaRef,
    handleKeyDown,
    handleChange,
    handleBlur,

    // Cleanup
    cleanup,
  };
}

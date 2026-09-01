'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { toasts } from '@/lib/utils/toast';
import { validateFile } from '@/lib/services/content-safety';
import { postMessage } from '@/modules/messages/actions';
import type { AiInlineMeta, Message } from '@/lib/types/index';
import { useMessageDraft } from './use-message-draft';
import { useMentions } from './use-mentions';
import { useToolbar } from './use-toolbar';

export { draftKey } from './use-message-draft';

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
  onMessagePosted?: (message: Message, meta?: AiInlineMeta) => void;
  onOptimisticMessage?: (message: Message) => void;
  onMessageError?: (tempId: string) => void;
  onSuccess?: () => void;
  onCancelReply?: () => void;
  aiClientStream?: boolean;
}

interface UseMessageComposerReturn {
  content: string;
  setContent: (value: string) => void;
  selectedFile: File | null;
  setSelectedFile: (file: File | null) => void;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleBold: () => void;
  handleItalic: () => void;
  handleCode: () => void;
  handleLink: () => void;
  mentionedUserIds: string[];
  mentionCandidates: import('@/components/chat/mention-suggest').MentionCandidate[];
  mentionOpen: boolean;
  activeMentionIndex: number;
  setActiveMentionIndex: (index: number) => void;
  detectMentionQuery: (value: string, caretIndex: number) => void;
  applyMentionSelection: (candidate: import('@/components/chat/mention-suggest').MentionCandidate) => void;
  closeMentions: () => void;
  mentionListRef: React.RefObject<HTMLDivElement | null>;
  handleEmojiSelect: (emoji: string) => void;
  insertAtCursor: (text: string) => void;
  handleAtSai: () => void;
  handleSubmit: (formData?: FormData) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
  canSubmit: boolean;
  showPollBuilder: boolean;
  setShowPollBuilder: (val: boolean) => void;
  pollQuestion: string;
  setPollQuestion: (val: string) => void;
  pollOptions: string[];
  setPollOptions: (val: string[]) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handleChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleBlur: () => void;
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
    aiClientStream = false,
  } = options;

  const [content, setContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll states
  const [showPollBuilder, setShowPollBuilder] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);

  // Sub-hooks
  const draft = useMessageDraft(threadId, parentId, content, setContent);
  const mentions = useMentions({ threadId, content, setContent });
  const toolbar = useToolbar({ content, setContent, textareaRef: mentions.textareaRef });

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
      const hasPoll = showPollBuilder && pollQuestion.trim().length > 0 && pollOptions.filter(o => o.trim()).length >= 2;
      if (!content.trim() && !selectedFile && !hasPoll) {
        toasts.error('Message cannot be empty');
        return;
      }

      const messageContent = content.trim() || (hasPoll ? `Poll: ${pollQuestion.trim()}` : '');
      const tempId = `temp-${crypto.randomUUID()}`;

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

      onOptimisticMessage?.(optimisticMessage);

      setContent('');
      draft.clear();
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      mentions.setMentionedUserIds([]);
      mentions.closeMentions();
      onCancelReply?.();
      setShowPollBuilder(false);
      setPollQuestion('');
      setPollOptions(['', '']);

      setIsSubmitting(true);
      setError(null);

      const data = formData ?? new FormData();
      data.set('threadId', threadId);
      data.set('content', messageContent);
      if (parentId) data.set('parentId', parentId);
      if (replyTo && !parentId) data.set('parentId', replyTo.messageId);

      if (hasPoll) {
        data.set('poll', JSON.stringify({
          question: pollQuestion.trim(),
          options: pollOptions.filter(o => o.trim()),
          expiresAt: null
        }));
      }

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

      if (mentions.mentionedUserIds.length > 0) {
        data.append('mentions', JSON.stringify(mentions.mentionedUserIds));
      }

      if (aiClientStream) {
        data.set('clientStreams', '1');
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
        const aiInline: AiInlineMeta['aiInline'] = result.data.aiInlineStreaming
          ? 'streaming'
          : result.data.aiInlineQueued
            ? 'queued'
            : result.data.aiInlineLimited
              ? 'limited'
              : null;
        onMessagePosted?.(transformedMessage, { aiInline });
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
      onOptimisticMessage,
      onMessagePosted,
      onMessageError,
      onSuccess,
      onCancelReply,
      showPollBuilder,
      pollQuestion,
      pollOptions,
      aiClientStream,
      draft,
      mentions,
    ]
  );

  // --- Keyboard ---
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentions.mentionOpen && mentions.mentionCandidates.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          mentions.setActiveMentionIndex((prev) =>
            prev + 1 >= mentions.mentionCandidates.length ? 0 : prev + 1
          );
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          mentions.setActiveMentionIndex((prev) =>
            prev - 1 < 0 ? mentions.mentionCandidates.length - 1 : prev - 1
          );
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const selected = mentions.mentionCandidates[mentions.activeMentionIndex];
          if (selected) {
            mentions.applyMentionSelection(selected);
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          mentions.closeMentions();
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      } else if (e.key === 'Escape' && replyTo) {
        onCancelReply?.();
        mentions.closeMentions();
      }
    },
    [mentions, handleSubmit, replyTo, onCancelReply]
  );

  // --- Change / Blur ---
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = e.target.value;
      const caret = e.target.selectionStart ?? nextValue.length;
      setContent(nextValue);
      mentions.detectMentionQuery(nextValue, caret);
    },
    [mentions]
  );

  const handleBlur = useCallback(() => {}, []);

  // --- Cleanup ---
  const cleanup = useCallback(() => {
    // mentionTimeoutRef cleanup is handled by useMentions
  }, []);

  // --- canSubmit ---
  const canSubmit = useMemo(() => {
    const hasContent = content.trim().length > 0;
    const hasFile = !!selectedFile;
    const hasPoll = showPollBuilder && pollQuestion.trim().length > 0 && pollOptions.filter(o => o.trim()).length >= 2;
    return hasContent || hasFile || hasPoll;
  }, [content, selectedFile, showPollBuilder, pollQuestion, pollOptions]);

  return {
    content,
    setContent,
    selectedFile,
    setSelectedFile,
    handleFileSelect,
    fileInputRef,
    handleBold: toolbar.handleBold,
    handleItalic: toolbar.handleItalic,
    handleCode: toolbar.handleCode,
    handleLink: toolbar.handleLink,
    mentionedUserIds: mentions.mentionedUserIds,
    mentionCandidates: mentions.mentionCandidates,
    mentionOpen: mentions.mentionOpen,
    activeMentionIndex: mentions.activeMentionIndex,
    setActiveMentionIndex: mentions.setActiveMentionIndex,
    detectMentionQuery: mentions.detectMentionQuery,
    applyMentionSelection: mentions.applyMentionSelection,
    closeMentions: mentions.closeMentions,
    mentionListRef: mentions.mentionListRef,
    handleEmojiSelect: toolbar.handleEmojiSelect,
    insertAtCursor: toolbar.insertAtCursor,
    handleAtSai: toolbar.handleAtSai,
    handleSubmit,
    isSubmitting,
    error,
    canSubmit,
    showPollBuilder,
    setShowPollBuilder,
    pollQuestion,
    setPollQuestion,
    pollOptions,
    setPollOptions,
    textareaRef: mentions.textareaRef,
    handleKeyDown,
    handleChange,
    handleBlur,
    cleanup,
  };
}

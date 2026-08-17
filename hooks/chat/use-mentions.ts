'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { searchMentionUsers } from '@/modules/messages/actions';
import type { MentionCandidate } from '@/components/chat/mention-suggest';

interface UseMentionOptions {
  threadId: string;
  content: string;
  setContent: (value: string) => void;
}

/**
 * Detects @mention queries in text, fetches candidates, and manages selection.
 *
 * Exposes `detectMentionQuery` (call on content change), `applyMentionSelection`
 * (call when user picks a candidate), `closeMentions`, and keyboard navigation state.
 */
export function useMentions({ threadId, content, setContent }: UseMentionOptions) {
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [mentionCandidates, setMentionCandidates] = useState<MentionCandidate[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const mentionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mentionRequestIdRef = useRef(0);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (mentionTimeoutRef.current) {
        clearTimeout(mentionTimeoutRef.current);
      }
    };
  }, []);

  const closeMentions = useCallback(() => {
    setMentionOpen(false);
    setMentionCandidates([]);
    setActiveMentionIndex(0);
    setMentionStartIndex(null);
  }, []);

  const resolveMentionCandidates = useCallback(
    async (query: string) => {
      const requestId = ++mentionRequestIdRef.current;
      const result = await searchMentionUsers({ threadId, query });
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
    [content, mentionStartIndex, closeMentions, setContent]
  );

  return {
    mentionedUserIds,
    setMentionedUserIds,
    mentionCandidates,
    mentionOpen,
    activeMentionIndex,
    setActiveMentionIndex,
    detectMentionQuery,
    applyMentionSelection,
    closeMentions,
    mentionListRef,
    textareaRef,
  };
}

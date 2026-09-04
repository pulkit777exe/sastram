'use client';

import { useCallback, useEffect, useRef } from 'react';

export function draftKey(threadId: string, parentId?: string): string {
  return `sastram:draft:${threadId}:${parentId ?? 'root'}`;
}

function readDraft(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeDraft(key: string, content: string): void {
  try {
    if (content) {
      localStorage.setItem(key, content);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // quota exceeded or localStorage unavailable — silent fail
  }
}

function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // localStorage unavailable — silent fail
  }
}

/**
 * Manages draft autosave for a message composer.
 *
 * Persists content to localStorage with a debounced write. Restores on mount.
 * Provides `saveDraft` and `clearDraft` for imperative control.
 */
const DRAFT_DEBOUNCE_MS = 700;

export function useMessageDraft(
  threadId: string,
  parentId: string | undefined,
  content: string,
  setContent: (value: string) => void
) {
  const draftKeyRef = useRef<string | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore draft on mount
  useEffect(() => {
    const key = draftKey(threadId, parentId);
    draftKeyRef.current = key;

    const saved = readDraft(key);
    const hasSavedDraft = saved !== null && saved.length > 0;
    if (hasSavedDraft) {
      setContent(saved as string);
    }
  }, [threadId, parentId, setContent]);

  // Debounced draft write on content change
  useEffect(() => {
    const hasKey = draftKeyRef.current !== null;
    if (!hasKey) {
      return;
    }

    if (draftTimerRef.current !== null) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }

    draftTimerRef.current = setTimeout(() => {
      const key = draftKeyRef.current as string;
      writeDraft(key, content);
    }, DRAFT_DEBOUNCE_MS);

    return () => {
      if (draftTimerRef.current !== null) {
        clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
    };
  }, [content]);

  const saveDraft = useCallback((value: string) => {
    const hasKey = draftKeyRef.current !== null;
    if (hasKey) {
      writeDraft(draftKeyRef.current as string, value);
    }
  }, []);

  const clear = useCallback(() => {
    const hasKey = draftKeyRef.current !== null;
    if (hasKey) {
      clearDraft(draftKeyRef.current as string);
    }
  }, []);

  return { saveDraft, clear };
}

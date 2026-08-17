'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
    if (saved) setContent(saved); // eslint-disable-line react-hooks/set-state-in-effect
  }, [threadId, parentId, setContent]);

  // Debounced draft write on content change
  useEffect(() => {
    if (!draftKeyRef.current) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      writeDraft(draftKeyRef.current!, content);
    }, 700);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [content]);

  const saveDraft = useCallback((value: string) => {
    if (draftKeyRef.current) writeDraft(draftKeyRef.current, value);
  }, []);

  const clear = useCallback(() => {
    if (draftKeyRef.current) clearDraft(draftKeyRef.current);
  }, []);

  return { saveDraft, clear };
}

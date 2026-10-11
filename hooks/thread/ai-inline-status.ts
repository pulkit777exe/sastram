'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export const AI_PENDING_TIMEOUT_MS = 120_000;

export type AiInlineStatus = 'queued' | 'pending' | 'streaming' | 'failed' | 'limited';

export type AiInlineStatusMap = Record<string, AiInlineStatus>;

export type AiInlineAction =
  | { type: 'set'; messageId: string; status: AiInlineStatus }
  | { type: 'clear'; messageId: string }
  | { type: 'timeout'; messageId: string };

export function aiInlineStatusReducer(state: AiInlineStatusMap, action: AiInlineAction): AiInlineStatusMap {
  switch (action.type) {
    case 'set': {
      if (state[action.messageId] === action.status) return state;
      return { ...state, [action.messageId]: action.status };
    }
    case 'clear': {
      if (!(action.messageId in state)) return state;
      const next = { ...state };
      delete next[action.messageId];
      return next;
    }
    case 'timeout': {
      // TIMEOUT only transitions pending -> failed; every other state is left alone.
      if (state[action.messageId] !== 'pending') return state;
      return { ...state, [action.messageId]: 'failed' };
    }
    default:
      return state;
  }
}

interface UseAiInlineStatusOptions {
  timeoutMs?: number;
}

export function useAiInlineStatus(options?: UseAiInlineStatusOptions) {
  const timeoutMs = options?.timeoutMs ?? AI_PENDING_TIMEOUT_MS;
  const [status, setStatus] = useState<AiInlineStatusMap>({});
  const statusRef = useRef<AiInlineStatusMap>(status);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const clearTimer = useCallback((messageId: string) => {
    const timer = timersRef.current.get(messageId);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(messageId);
    }
  }, []);

  const clearStatus = useCallback(
    (messageId: string) => {
      setStatus((prev) => aiInlineStatusReducer(prev, { type: 'clear', messageId }));
      clearTimer(messageId);
    },
    [clearTimer]
  );

  const armTimeout = useCallback(
    (messageId: string) => {
      clearTimer(messageId);
      const timer = setTimeout(() => {
        setStatus((prev) => aiInlineStatusReducer(prev, { type: 'timeout', messageId }));
        timersRef.current.delete(messageId);
      }, timeoutMs);
      timersRef.current.set(messageId, timer);
    },
    [clearTimer, timeoutMs]
  );

  const setPending = useCallback(
    (messageId: string) => {
      setStatus((prev) => aiInlineStatusReducer(prev, { type: 'set', messageId, status: 'pending' }));
      armTimeout(messageId);
    },
    [armTimeout]
  );

  const setInlineStatus = useCallback(
    (messageId: string, next: AiInlineStatus) => {
      setStatus((prev) => aiInlineStatusReducer(prev, { type: 'set', messageId, status: next }));
      if (next === 'pending' || next === 'queued' || next === 'streaming') {
        armTimeout(messageId);
      } else {
        clearTimer(messageId);
      }
    },
    [armTimeout, clearTimer]
  );

  const markFailedIfPending = useCallback((messageId: string) => {
    setStatus((prev) => aiInlineStatusReducer(prev, { type: 'timeout', messageId }));
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  return {
    aiInlineStatus: status,
    aiInlineStatusRef: statusRef,
    aiInlineTimerRef: timersRef,
    setAiPending: setPending,
    setAiInlineStatus: setInlineStatus,
    clearAiStatus: clearStatus,
    markFailedIfPending,
  };
}

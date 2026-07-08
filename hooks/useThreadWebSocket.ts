'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { Message } from '@/lib/types/index';

/** @deprecated Typing indicators are not available without WebSocket. */
export interface TypingUser {
  userId: string;
  userName: string;
}

export interface ReactionUpdate {
  messageId: string;
  reactionType: string;
  count: number;
}

interface UseThreadWebSocketOptions {
  threadId: string;
  currentUserId: string;
  onNewMessage?: (message: Message) => void;
  onMessageDeleted?: (messageId: string) => void;
  onMessageEdited?: (messageId: string, content: string) => void;
  onPinUpdate?: (messageId: string, isPinned: boolean) => void;
  onTypingUpdate?: (typers: TypingUser[]) => void;
  onAiComplete?: (parentMessageId: string) => void;
  onReactionUpdate?: (update: ReactionUpdate) => void;
  onReconnect?: () => void;
}

export function useThreadWebSocket({
  threadId,
  currentUserId,
  onNewMessage,
  onMessageDeleted,
  onMessageEdited,
  onPinUpdate,
  onTypingUpdate,
  onAiComplete,
  onReactionUpdate,
  onReconnect,
}: UseThreadWebSocketOptions) {
  const mountedRef = useRef(true);

  // Keep callbacks fresh
  const callbacksRef = useRef({
    onNewMessage,
    onMessageDeleted,
    onMessageEdited,
    onPinUpdate,
    onTypingUpdate,
    onAiComplete,
    onReactionUpdate,
    onReconnect,
  });
  useEffect(() => {
    callbacksRef.current = {
      onNewMessage,
      onMessageDeleted,
      onMessageEdited,
      onPinUpdate,
      onTypingUpdate,
      onAiComplete,
      onReactionUpdate,
      onReconnect,
    };
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** @deprecated Typing indicators not available without WebSocket. */
  const emitTypingStart = useCallback(() => {
    // no-op
  }, []);

  /** @deprecated Typing indicators not available without WebSocket. */
  const emitTypingStop = useCallback(() => {
    // no-op
  }, []);

  return { emitTypingStart, emitTypingStop, typers: [] as TypingUser[] };
}

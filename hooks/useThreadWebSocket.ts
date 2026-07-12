'use client';

import { useEffect, useRef } from 'react';
import type { Message } from '@/lib/types/index';

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

  // Typing indicators removed — no WebSocket server for real-time typing
}

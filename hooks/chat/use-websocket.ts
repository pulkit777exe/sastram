import { useCallback } from 'react';
import type { TypingIndicator } from '@/lib/types/index';

export function useThreadWebSocket(threadId: string | null) {
  const sendMessage = useCallback((_message: string) => {
    // no-op: messages are sent via server actions, not WebSocket
  }, []);

  const sendTypingStart = useCallback(() => {
    // no-op: typing indicators disabled without WebSocket
  }, []);

  const sendTypingStop = useCallback(() => {
    // no-op: typing indicators disabled without WebSocket
  }, []);

  return {
    isConnected: true,
    lastMessage: null,
    typingUsers: [] as TypingIndicator[],
    sendMessage,
    sendTypingStart,
    sendTypingStop,
  };
}

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { createThreadSocket } from '@/lib/services/thread-socket';
import type { Message } from '@/lib/types/index';

const VALID_WS_TYPES = new Set([
  'NEW_MESSAGE', 'MESSAGE_DELETED', 'MESSAGE_EDITED', 'PIN_UPDATE', 'REACTION_UPDATE',
  'USER_TYPING', 'USER_STOPPED_TYPING',
]);

function validateWsMessage(raw: unknown): { type: string; payload: Record<string, unknown> } | null {
  if (!raw || typeof raw !== 'object') return null;
  const msg = raw as Record<string, unknown>;
  if (typeof msg.type !== 'string' || !VALID_WS_TYPES.has(msg.type)) return null;
  if (!msg.payload || typeof msg.payload !== 'object') return null;
  return { type: msg.type, payload: msg.payload as Record<string, unknown> };
}

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
  const wsRef = useRef<WebSocket | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingEmitRef = useRef<number>(0);
  const [typers, setTypers] = useState<TypingUser[]>([]);
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Keep callbacks fresh without re-connecting
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

    function connect() {
      if (!mountedRef.current) return;

      const ws = createThreadSocket(threadId);
      if (!ws) return;
      wsRef.current = ws;

      ws.onopen = () => {
        const wasReconnect = reconnectAttemptsRef.current > 0;
        reconnectAttemptsRef.current = 0;
        if (wasReconnect) {
          callbacksRef.current.onReconnect?.();
        }
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        wsRef.current = null;
        if (!mountedRef.current) return;

        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s cap
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      ws.onmessage = (event) => {
        try {
        const raw = JSON.parse(event.data as string);
        const msg = validateWsMessage(raw);
        if (!msg) {
          return;
        }

        switch (msg.type) {
          case 'NEW_MESSAGE': {
            const payload = msg.payload as Record<string, unknown>;
            const senderId = payload.senderId as string;
            const isAiResponse = Boolean(payload.isAiResponse);
            const isComplete = Boolean(payload.isComplete);
            const truncated = Boolean(payload.truncated);

            // Don't echo own non-AI messages back (already in state)
            if (senderId === currentUserId && !isAiResponse) return;

            const sender = payload.sender as
              | { id: string; name: string; image?: string | null }
              | undefined;

            const newMsg: Message = {
              id: payload.id as string,
              content: payload.content as string,
              senderId,
              threadId: payload.threadId as string,
              parentId: (payload.parentId as string | null) ?? null,
              createdAt: new Date(payload.createdAt as string),
              updatedAt: new Date(payload.createdAt as string),
              depth: (payload.depth as number) ?? 0,
              isEdited: false,
              isPinned: false,
              likeCount: (payload.likeCount as number) ?? 0,
              replyCount: 0,
              isAiResponse,
              truncated,
              deletedAt: null,
              sender: sender
                ? {
                    id: sender.id,
                    name: sender.name,
                    image: sender.image ?? null,
                  }
                : {
                    id: senderId,
                    name: isAiResponse ? 'Sastram AI' : 'User',
                    image: null,
                  },
              attachments: Array.isArray(payload.attachments)
                ? (
                    payload.attachments as Array<{
                      id: string;
                      url: string;
                      type: string;
                      name?: string | null;
                      size?: number | null;
                    }>
                  ).map((a) => ({
                    id: a.id,
                    url: a.url,
                    type: a.type,
                    name: a.name ?? null,
                    size: a.size ?? null,
                  }))
                : [],
              thread: { id: payload.threadId as string, name: '', slug: '' },
            };

            // Deliver message or streaming content update
            callbacksRef.current.onNewMessage?.(newMsg);

            // When AI stream is complete, clear the pending indicator
            if (isAiResponse && isComplete && newMsg.parentId) {
              callbacksRef.current.onAiComplete?.(newMsg.parentId);
            }

            // Remove sender from typing list
            setTypers((prev) => prev.filter((t) => t.userId !== senderId));
            break;
          }

          case 'MESSAGE_DELETED': {
            const { messageId } = msg.payload as { messageId: string };
            callbacksRef.current.onMessageDeleted?.(messageId);
            break;
          }

          case 'MESSAGE_EDITED': {
            const { messageId, content } = msg.payload as { messageId: string; content: string };
            callbacksRef.current.onMessageEdited?.(messageId, content);
            break;
          }

          case 'PIN_UPDATE': {
            const { messageId, isPinned } = msg.payload as {
              messageId: string;
              isPinned: boolean;
            };
            callbacksRef.current.onPinUpdate?.(messageId, isPinned);
            break;
          }

          case 'REACTION_UPDATE': {
            const { messageId, reactionType, count } = msg.payload as {
              messageId: string;
              reactionType: string;
              count: number;
            };
            callbacksRef.current.onReactionUpdate?.({ messageId, reactionType, count });
            break;
          }

          case 'USER_TYPING': {
            const { userId, userName } = msg.payload as {
              userId: string;
              userName: string;
              threadId: string;
            };
            if (userId === currentUserId) return;

            setTypers((prev) => {
              if (prev.some((t) => t.userId === userId)) return prev;
              return [...prev, { userId, userName }];
            });

            const existing = typingTimersRef.current.get(userId);
            if (existing) clearTimeout(existing);
            typingTimersRef.current.set(
              userId,
              setTimeout(() => {
                setTypers((prev) => {
                  const next = prev.filter((t) => t.userId !== userId);
                  return next.length === prev.length ? prev : next;
                });
                typingTimersRef.current.delete(userId);
              }, 4000)
            );
            break;
          }

          case 'USER_STOPPED_TYPING': {
            const { userId } = msg.payload as {
              userId: string;
              threadId: string;
            };
            if (userId === currentUserId) return;
            setTypers((prev) => {
              const next = prev.filter((t) => t.userId !== userId);
              return next.length === prev.length ? prev : next;
            });
            const timer = typingTimersRef.current.get(userId);
            if (timer) {
              clearTimeout(timer);
              typingTimersRef.current.delete(userId);
            }
            break;
          }
        }
      } catch {
        // Ignore malformed messages
      }
    };
    } // end connect()

    connect();

    const timersMap = typingTimersRef.current;

    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      const currentWs = wsRef.current;
      if (currentWs) {
        currentWs.close();
        wsRef.current = null;
      }
      timersMap.forEach((t) => clearTimeout(t));
      timersMap.clear();
    };
  }, [threadId, currentUserId]);

  // Propagate typers to parent
  useEffect(() => {
    callbacksRef.current.onTypingUpdate?.(typers);
  }, [typers]);

  const sendWsMessage = useCallback((type: string, payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws) return;

    const message = JSON.stringify({ type, payload });

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    } else if (ws.readyState === WebSocket.CONNECTING) {
      const sendWhenOpen = () => {
        ws.send(message);
        ws.removeEventListener('open', sendWhenOpen);
      };
      ws.addEventListener('open', sendWhenOpen);
    }
  }, []);

  const emitTypingStop = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    lastTypingEmitRef.current = 0;
    sendWsMessage('USER_STOPPED_TYPING', { threadId: threadId });
  }, [threadId, sendWsMessage]);

  const emitTypingStart = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingEmitRef.current < 3000) return;
    lastTypingEmitRef.current = now;

    sendWsMessage('USER_TYPING', { threadId: threadId });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      emitTypingStop();
    }, 3000);
  }, [threadId, sendWsMessage, emitTypingStop]);

  return { emitTypingStart, emitTypingStop, typers };
}

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { createThreadSocket } from '@/lib/infrastructure/websocket/client';
import { validateWebSocketMessage } from '@/lib/schemas/websocket';
import type { Message } from '@/lib/types/index';

export interface TypingUser {
  userId: string;
  userName: string;
}

interface UseThreadWebSocketOptions {
  threadId: string;
  currentUserId: string;
  onNewMessage?: (message: Message) => void;
  onMessageDeleted?: (messageId: string) => void;
  onPinUpdate?: (messageId: string, isPinned: boolean) => void;
  onTypingUpdate?: (typers: TypingUser[]) => void;
  // NEW: called when AI stream emits isComplete:true — clears "pending" indicator
  onAiComplete?: (parentMessageId: string) => void;
}

export function useThreadWebSocket({
  threadId,
  currentUserId,
  onNewMessage,
  onMessageDeleted,
  onPinUpdate,
  onTypingUpdate,
  onAiComplete,
}: UseThreadWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingEmitRef = useRef<number>(0);
  const [typers, setTypers] = useState<TypingUser[]>([]);
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Keep callbacks fresh without re-connecting
  const callbacksRef = useRef({
    onNewMessage,
    onMessageDeleted,
    onPinUpdate,
    onTypingUpdate,
    onAiComplete,
  });
  useEffect(() => {
    callbacksRef.current = {
      onNewMessage,
      onMessageDeleted,
      onPinUpdate,
      onTypingUpdate,
      onAiComplete,
    };
  });

  useEffect(() => {
    const ws = createThreadSocket(threadId);
    if (!ws) {
      console.log('[WS] No WebSocket created (possibly missing /ws endpoint)');
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected to', ws.url);
    };

    ws.onerror = (error) => {
      console.log('[WS] Error:', error);
    };

    ws.onmessage = (event) => {
      console.log('[WS] Raw message received:', event.data.slice(0, 200));
      try {
        const raw = JSON.parse(event.data as string);
        const validation = validateWebSocketMessage(raw);
        if (!validation.success) {
          console.log('[WS] Validation failed:', validation.error);
          return;
        }

        const msg = validation.data;

        switch (msg.type) {
          case 'NEW_MESSAGE': {
            const payload = msg.payload as Record<string, unknown>;
            const senderId = payload.senderId as string;
            const isAiResponse = Boolean(payload.isAiResponse);
            const isComplete = Boolean(payload.isComplete);

            console.log('[WS] NEW_MESSAGE:', { 
              isAiResponse, 
              isComplete, 
              parentId: payload.parentId,
              content: (payload.content as string)?.slice(0, 50)
            });

            // Don't echo own non-AI messages back (already in state)
            if (senderId === currentUserId && !isAiResponse) return;

            const sender = payload.sender as
              | { id: string; name: string; image?: string | null }
              | undefined;

            const newMsg: Message = {
              id: payload.id as string,
              content: payload.content as string,
              senderId,
              sectionId: payload.sectionId as string,
              parentId: (payload.parentId as string | null) ?? null,
              createdAt: new Date(payload.createdAt as string),
              updatedAt: new Date(payload.createdAt as string),
              depth: (payload.depth as number) ?? 0,
              isEdited: false,
              isPinned: false,
              likeCount: (payload.likeCount as number) ?? 0,
              replyCount: 0,
              isAiResponse,
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
              section: { id: payload.sectionId as string, name: '', slug: '' },
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

          case 'PIN_UPDATE': {
            const { messageId, isPinned } = msg.payload as {
              messageId: string;
              isPinned: boolean;
            };
            callbacksRef.current.onPinUpdate?.(messageId, isPinned);
            break;
          }

          case 'USER_TYPING': {
            const { userId, userName } = msg.payload as {
              userId: string;
              userName: string;
              sectionId: string;
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
                setTypers((prev) => prev.filter((t) => t.userId !== userId));
                typingTimersRef.current.delete(userId);
              }, 4000)
            );
            break;
          }

          case 'USER_STOPPED_TYPING': {
            const { userId } = msg.payload as {
              userId: string;
              sectionId: string;
            };
            setTypers((prev) => prev.filter((t) => t.userId !== userId));
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

    const timersMap = typingTimersRef.current;

    return () => {
      ws.close();
      wsRef.current = null;
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
    sendWsMessage('USER_STOPPED_TYPING', { sectionId: threadId });
  }, [threadId, sendWsMessage]);

  const emitTypingStart = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingEmitRef.current < 3000) return;
    lastTypingEmitRef.current = now;

    sendWsMessage('USER_TYPING', { sectionId: threadId });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      emitTypingStop();
    }, 3000);
  }, [threadId, sendWsMessage, emitTypingStop]);

  return { emitTypingStart, emitTypingStop, typers };
}

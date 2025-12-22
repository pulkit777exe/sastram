import { useEffect, useRef, useState, useCallback } from "react";
import { logger } from "@/lib/logger";
import { createThreadSocket } from "@/lib/ws/client";
import type { TypingIndicator, WebSocketEventType } from "@/lib/types";

interface WebSocketEvent {
  type: WebSocketEventType;
  payload: {
    sectionId: string;
    [key: string]: unknown;
  };
}

export function useThreadWebSocket(threadId: string | null) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<TypingIndicator[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const reconnectAttemptsRef = useRef(0);
  const typingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    if (!threadId) return;

    function connect() {
      if (!threadId) return;
      const ws = createThreadSocket(threadId);
      if (!ws) return;

      wsRef.current = ws;

      ws.onopen = () => {
        logger.debug(`Connected to thread socket ${threadId}`);
        setIsConnected(true);
        reconnectAttemptsRef.current = 0; // Reset reconnect attempts on successful connection
      };

      ws.onmessage = (event) => {
        try {
          const data: WebSocketEvent = JSON.parse(event.data);

          // Handle typing indicators
          if (data.type === "USER_TYPING") {
            const typingData = data.payload as unknown as {
              userId: string;
              userName: string;
            };
            setTypingUsers((prev) => {
              const exists = prev.find((u) => u.userId === typingData.userId);
              if (exists) return prev;
              return [
                ...prev,
                {
                  userId: typingData.userId,
                  userName: typingData.userName,
                  sectionId: threadId,
                  timestamp: Date.now(),
                },
              ];
            });
          } else if (data.type === "USER_STOPPED_TYPING") {
            const typingData = data.payload as unknown as { userId: string };
            setTypingUsers((prev) =>
              prev.filter((u) => u.userId !== typingData.userId)
            );
          } else {
            // For other events, pass raw data to parent
            setLastMessage(event.data);
          }
        } catch {
          // If not JSON, treat as raw message
          setLastMessage(event.data);
        }
      };

      ws.onclose = () => {
        logger.debug("Disconnected from thread socket");
        setIsConnected(false);
        setTypingUsers([]); // Clear typing indicators on disconnect

        // Exponential backoff reconnection
        const backoffDelay = Math.min(
          1000 * Math.pow(2, reconnectAttemptsRef.current),
          30000
        );
        reconnectAttemptsRef.current += 1;

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, backoffDelay);
      };

      ws.onerror = (error) => {
        logger.error("WebSocket error:", error);
      };
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [threadId]);

  const sendMessage = useCallback((message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(message);
    } else {
      logger.warn("WebSocket is not connected");
    }
  }, []);

  const sendTypingIndicator = useCallback((isTyping: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: isTyping ? "USER_TYPING" : "USER_STOPPED_TYPING",
        })
      );
    }
  }, []);

  const sendTypingStart = useCallback(() => {
    sendTypingIndicator(true);

    // Auto-stop typing after 3 seconds
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingIndicator(false);
    }, 3000);
  }, [sendTypingIndicator]);

  const sendTypingStop = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    sendTypingIndicator(false);
  }, [sendTypingIndicator]);

  return {
    isConnected,
    lastMessage,
    typingUsers,
    sendMessage,
    sendTypingStart,
    sendTypingStop,
  };
}

import { useEffect, useRef, useState } from 'react';

import { logger } from "@/lib/logger";
import { createThreadSocket } from "@/lib/ws/client";

export function useThreadWebSocket(threadId: string | null) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

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
      };

      ws.onmessage = (event) => {
        setLastMessage(event.data);
      };

      ws.onclose = () => {
        logger.debug("Disconnected from thread socket");
        setIsConnected(false);

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
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
      wsRef.current?.close();
    };
  }, [threadId]);

  const sendMessage = (message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(message);
    } else {
      logger.warn("WebSocket is not connected");
    }
  };

  return { isConnected, lastMessage, sendMessage };
}

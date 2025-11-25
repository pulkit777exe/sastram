"use client";

import { useState, useEffect, useRef } from "react";
import { MessageList } from "./message-list";
import { PostMessageForm } from "./post-message-form";
import { useThreadWebSocket } from "../hooks/use-websocket";
import { logger } from "@/lib/logger";
import type { Message } from "@/lib/types";

interface ChatAreaProps {
  initialMessages: Message[];
  sectionId: string;
  currentUser: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

export function ChatArea({ initialMessages, sectionId }: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const { isConnected, lastMessage } = useThreadWebSocket(sectionId);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    const handleMessage = () => {
      try {
        const data = JSON.parse(lastMessage);
        if (data.type === "NEW_MESSAGE" && data.payload.sectionId === sectionId) {
          const newMessage = {
            ...data.payload,
            createdAt: new Date(data.payload.createdAt),
          };
          
          setMessages((prev) => {
            // Prevent duplicates
            if (prev.some((m) => m.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });
        }
      } catch (e) {
        logger.error("Failed to parse WS message", e);
      }
    };

    handleMessage();
  }, [lastMessage, sectionId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleMessagePosted = (message: Message) => {
    // Optimistically add to list (or wait for WS echo? Let's wait for WS echo to be safe/consistent, 
    // OR add immediately and let dedup handle it. Adding immediately feels faster.)
    setMessages((prev) => [...prev, message]);

  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-end px-4 py-2">
        <div className={`flex items-center gap-2 text-xs ${isConnected ? "text-green-500" : "text-red-500"}`}>
          <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
          {isConnected ? "Live" : "Connecting..."}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-4" ref={scrollRef}>
        <MessageList messages={messages} />
      </div>

      <PostMessageForm sectionId={sectionId} onMessagePosted={handleMessagePosted} />
    </div>
  );
}

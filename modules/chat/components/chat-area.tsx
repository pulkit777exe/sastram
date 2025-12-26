"use client";

import { useState, useEffect, useRef } from "react";
import { MessageList } from "./message-list";
import { PostMessageForm } from "./post-message-form";
import { TypingIndicatorComponent } from "./typing-indicator";
import { useThreadWebSocket } from "../hooks/use-websocket";
import { logger } from "@/lib/infrastructure/logger";
import { Hash, Bell, Pin, Users, Inbox, HelpCircle } from "lucide-react";
import type { Message } from "@/lib/types/index";

interface ChatAreaProps {
  initialMessages: Message[];
  sectionId: string;
  currentUser: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

export function ChatArea({ initialMessages, sectionId, currentUser }: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const { isConnected, lastMessage, typingUsers } = useThreadWebSocket(sectionId);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!lastMessage) return;

    const handleMessage = () => {
      try {
        const data = JSON.parse(lastMessage);

        if (
          data.type === "NEW_MESSAGE" &&
          data.payload.sectionId === sectionId
        ) {
          const newMessage = {
            ...data.payload,
            createdAt: new Date(data.payload.createdAt),
          };

          setMessages((prev) => {
            if (prev.some((m) => m.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });
        } else if (
          data.type === "MESSAGE_DELETED" &&
          data.payload.sectionId === sectionId
        ) {
          const { messageId } = data.payload;
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
        }
      } catch (e) {
        logger.error("Failed to parse WS message", e);
      }
    };

    handleMessage();
  }, [lastMessage, sectionId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleMessagePosted = (message: Message) => {
    setMessages((prev) => [...prev, message]);
  };

  return (
    <div className="flex flex-col h-full bg-[#161618] text-[#dcddde] font-sans">

      {/* Chat Area: Clean Scrollable Space */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin scrollbar-thumb-[#202225] scrollbar-track-transparent" ref={scrollRef}>
        {/* Pass currentUser to MessageList for "My Message" styling */}
        <MessageList messages={messages} currentUser={currentUser} />
      </div>

      {/* Footer Area: Typing Indicator & Input */}
      <div className="px-4 pb-6 bg-[#36393f] relative z-20">
        <TypingIndicatorComponent users={typingUsers} />
        <div className="mt-1">
           <PostMessageForm
             sectionId={sectionId}
             onMessagePosted={handleMessagePosted}
           />
        </div>
      </div>
    </div>
  );
}
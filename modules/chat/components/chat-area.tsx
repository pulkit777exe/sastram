"use client";

import { useState, useEffect, useRef } from "react";
import { MessageList } from "./message-list";
import { PostMessageForm } from "./post-message-form";
import { TypingIndicatorComponent } from "./typing-indicator";
import { useThreadWebSocket } from "../hooks/use-websocket";
import { logger } from "@/lib/infrastructure/logger";
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
  const [replyingTo, setReplyingTo] = useState<{
    messageId: string;
    userName: string;
  } | null>(null);
  
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
        } else if (
          data.type === "MESSAGE_EDITED" &&
          data.payload.sectionId === sectionId
        ) {
          const { messageId, content } = data.payload;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? { ...m, content, isEdited: true, updatedAt: new Date() }
                : m
            )
          );
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

  const handleReply = (parentMessageId: string) => {
    const parentMessage = messages.find(m => m.id === parentMessageId);
    if (parentMessage) {
      setReplyingTo({
        messageId: parentMessageId,
        userName: parentMessage.sender.name || "Unknown",
      });
      
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
    }
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  return (
    <div className="flex flex-col h-full font-sans">
      <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin scrollbar-track-transparent" ref={scrollRef}>
        <MessageList 
          messages={messages} 
          currentUser={currentUser}
          onReply={handleReply}
          activeReplyId={replyingTo?.messageId}
        />
      </div>

      <div className="px-4 pb-6 relative z-20">
        <TypingIndicatorComponent users={typingUsers} />
        <div className="mt-1">
           <PostMessageForm
             sectionId={sectionId}
             onMessagePosted={handleMessagePosted}
             replyTo={replyingTo}
             onCancelReply={handleCancelReply}
           />
        </div>
      </div>
    </div>
  );
}
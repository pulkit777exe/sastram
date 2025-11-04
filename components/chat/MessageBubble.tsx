"use client";

import { Check, CheckCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Message } from "@/types";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  return (
    <div className={`flex gap-3 ${message.isOwn ? "flex-row-reverse" : ""}`}>
      {!message.isOwn && (
        <Avatar className="w-10 h-10 border-2 border-border shrink-0">
          <AvatarImage src={message.avatar} />
          <AvatarFallback>{message.sender[0]}</AvatarFallback>
        </Avatar>
      )}
      <div
        className={`flex flex-col ${
          message.isOwn ? "items-end" : "items-start"
        } flex-1 min-w-0`}
      >
        {!message.isOwn && (
          <span className="text-sm font-medium text-primary mb-1">
            {message.sender}
          </span>
        )}
        <div
          className={`
            px-4 py-2.5 rounded-2xl max-w-2xl
            ${
              message.isOwn
                ? "bg-secondary text-secondary-foreground shadow-inner"
                : "bg-accent text-foreground shadow-sm"
            }
          `}
        >
          <p className="text-sm leading-relaxed break-words">{message.content}</p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">{message.timestamp}</span>
          {message.isOwn && message.status && (
            <div className="flex items-center" aria-label={`Message ${message.status}`}>
              {message.status === "read" ? (
                <CheckCheck className="h-3.5 w-3.5 text-secondary" aria-label="Read" />
              ) : message.status === "delivered" ? (
                <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" aria-label="Delivered" />
              ) : (
                <Check className="h-3.5 w-3.5 text-muted-foreground" aria-label="Sent" />
              )}
            </div>
          )}
        </div>
      </div>
      {message.isOwn && (
        <Avatar className="w-10 h-10 border-2 border-secondary shrink-0">
          <AvatarImage src={message.avatar} />
          <AvatarFallback>Y</AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
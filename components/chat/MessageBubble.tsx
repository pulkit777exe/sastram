"use client";

import { Check, CheckCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// Assuming Message type is refined for this aesthetic
interface Message {
  id: string;
  sender: string;
  content: string;
  avatar?: string;
  timestamp: string;
  isOwn: boolean;
  status?: "sent" | "delivered" | "read";
}

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { isOwn, status, sender, content, avatar, timestamp } = message;

  return (
    <div className={cn(
      "flex w-full mb-6 group",
      isOwn ? "justify-end" : "justify-start"
    )}>
      <div className={cn(
        "flex max-w-[80%] md:max-w-[70%] gap-3",
        isOwn ? "flex-row-reverse" : "flex-row"
      )}>
        
        {/* Modern, Borderless Avatar */}
        <div className="shrink-0 mt-1">
          <Avatar className="w-8 h-8 rounded-full border border-zinc-200 shadow-sm">
            <AvatarImage src={avatar} />
            <AvatarFallback className="bg-zinc-100 text-zinc-600 text-[10px] font-bold">
              {sender[0]}
            </AvatarFallback>
          </Avatar>
        </div>

        <div className={cn(
          "flex flex-col",
          isOwn ? "items-end" : "items-start"
        )}>
          {/* Sender Name - Minimalist */}
          {!isOwn && (
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-tight mb-1 ml-1">
              {sender}
            </span>
          )}

          {/* The Bubble */}
          <div className={cn(
            "px-4 py-3 rounded-[20px] shadow-sm transition-all duration-200",
            isOwn 
              ? "bg-zinc-900 text-white rounded-tr-none" 
              : "bg-white border border-zinc-200 text-zinc-900 rounded-tl-none hover:border-zinc-300"
          )}>
            <p className="text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">
              {content}
            </p>
          </div>

          {/* Metadata Area */}
          <div className={cn(
            "flex items-center gap-2 mt-1.5 px-1",
            isOwn ? "flex-row" : "flex-row-reverse"
          )}>
            {isOwn && status && (
              <div className="flex items-center">
                {status === "read" ? (
                  <CheckCheck size={14} className="text-zinc-900" strokeWidth={3} />
                ) : (
                  <Check size={14} className="text-zinc-400" strokeWidth={2} />
                )}
              </div>
            )}
            <span className="text-[10px] font-medium text-zinc-400 tabular-nums">
              {timestamp}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
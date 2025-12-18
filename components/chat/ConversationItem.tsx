"use client";

import { Hash } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Conversation } from "@/types";
import { cn } from "@/lib/utils";

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}

export function ConversationItem({ conversation, isSelected, onClick }: ConversationItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full p-3 rounded-2xl text-left transition-all duration-200 mb-1 group",
        isSelected 
          ? "bg-white shadow-[0_2px_8px_rgba(0,0,0,0,04)] border border-zinc-200" 
          : "hover:bg-zinc-100/80 border border-transparent"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          {conversation.type === "channel" ? (
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
              isSelected ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-500"
            )}>
              <Hash size={18} strokeWidth={2.5} />
            </div>
          ) : (
            <Avatar className="w-10 h-10 border border-zinc-200">
              <AvatarImage src={conversation.avatar} />
              <AvatarFallback className="text-[10px] font-bold">{conversation.name[0]}</AvatarFallback>
            </Avatar>
          )}
          {conversation.online && (
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className={cn(
              "text-sm font-bold truncate tracking-tight",
              isSelected ? "text-zinc-900" : "text-zinc-700"
            )}>
              {conversation.name}
            </h3>
            <span className="text-[10px] font-medium text-zinc-400 tabular-nums">
              {conversation.timestamp}
            </span>
          </div>
          <p className="text-xs text-zinc-500 truncate mt-0.5 font-medium leading-none">
            {conversation.lastMessage}
          </p>
        </div>
        
        {conversation.unread > 0 && (
          <div className="w-5 h-5 rounded-full bg-zinc-900 text-white flex items-center justify-center text-[10px] font-bold shadow-sm">
            {conversation.unread}
          </div>
        )}
      </div>
    </button>
  );
}
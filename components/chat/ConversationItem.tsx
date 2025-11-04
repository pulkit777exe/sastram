"use client";

import { Hash } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Conversation } from "@/types";

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}

export function ConversationItem({ conversation, isSelected, onClick }: ConversationItemProps) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full p-3 rounded-xl text-left transition-all
        hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none
        ${isSelected ? "bg-accent shadow-inner" : ""}
      `}
      aria-label={`Open conversation with ${conversation.name}`}
    >
      <div className="flex items-start gap-3">
        <div className="relative">
          {conversation.type === "channel" ? (
            <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center shadow-inner">
              <Hash className="h-5 w-5 text-primary" />
            </div>
          ) : (
            <Avatar className="w-10 h-10 border-2 border-border">
              <AvatarImage src={conversation.avatar} />
              <AvatarFallback>{conversation.name[0]}</AvatarFallback>
            </Avatar>
          )}
          {conversation.online && (
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-dark-secondary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-medium text-sm text-foreground truncate">
              {conversation.name}
            </h3>
            <span className="text-xs text-muted-foreground shrink-0">
              {conversation.timestamp}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground truncate flex-1">
              {conversation.lastMessage}
            </p>
            {conversation.unread > 0 && (
              <Badge className="ml-2 bg-secondary text-secondary-foreground px-2 py-0.5 text-xs shadow-inner">
                {conversation.unread}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
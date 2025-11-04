"use client";

import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConversationItem } from "@/components/chat/ConversationItem";
import { Conversation } from "@/types";
import { useState } from "react";

interface ChatSidebarProps {
  conversations: Conversation[];
  activeSectionId: string | null;
  onSectionSelect: (id: string) => void;
  onCreateSection: () => void;
  isAdmin: boolean;
}

export function ChatSidebar({
  conversations,
  activeSectionId,
  onSectionSelect,
  onCreateSection,
  isAdmin,
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredConversations = conversations.filter((conv) =>
    conv.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex w-80 flex-col border-r bg-background">
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-foreground">Forum</h1>
          {isAdmin && (
            <Button
              size="icon"
              variant="ghost"
              onClick={onCreateSection}
              aria-label="Create new section"
            >
              <Plus className="h-5 w-5" />
            </Button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search sections..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Conversations List */}
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {searchQuery ? "No sections found" : "No sections yet"}
              </p>
              {isAdmin && !searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onCreateSection}
                  className="mt-2"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Section
                </Button>
              )}
            </div>
          ) : (
            filteredConversations.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                isSelected={activeSectionId === conversation.id}
                onClick={() => onSectionSelect(conversation.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
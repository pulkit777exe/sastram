"use client";

import { Plus, Search, ChevronsUpDown, Hash } from "lucide-react";
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
    <div className="flex w-72 flex-col border-r border-zinc-200 bg-[#FBFBFB] h-screen sticky top-0">
      {/* Header: Brand/Context Switcher style */}
      <div className="px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center text-white shadow-sm">
              <Hash size={18} strokeWidth={2.5} />
            </div>
            <h1 className="text-lg font-bold text-zinc-900 tracking-tight">Forum</h1>
          </div>
          <ChevronsUpDown size={18} className="text-zinc-400 cursor-pointer hover:text-zinc-600 transition-colors" />
        </div>

        {/* Search: Modern high-contrast input */}
        <div className="relative group">
          <Search 
            size={16} 
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-zinc-900 transition-colors" 
          />
          <Input
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-8 h-10 bg-white border-zinc-200 rounded-xl text-sm placeholder:text-zinc-400 focus-visible:ring-zinc-100 focus-visible:border-zinc-300 transition-all shadow-sm"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-300 text-[10px] font-mono font-bold border border-zinc-100 px-1.5 py-0.5 rounded bg-zinc-50">
            /
          </span>
        </div>
      </div>

      {/* Action Area: Label + Add Button */}
      <div className="px-6 mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
          Discussion Sections
        </span>
        {isAdmin && (
          <button
            onClick={onCreateSection}
            className="p-1 rounded-md hover:bg-zinc-200 text-zinc-400 hover:text-zinc-900 transition-all"
            aria-label="Create new section"
          >
            <Plus size={14} strokeWidth={3} />
          </button>
        )}
      </div>

      {/* Conversations List */}
      <ScrollArea className="flex-1 px-3">
        <div className="space-y-0.5 pb-4">
          {filteredConversations.length === 0 ? (
            <div className="px-3 py-12 text-center">
              <p className="text-xs font-medium text-zinc-400">
                {searchQuery ? "No matches found" : "No active threads"}
              </p>
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

      {/* Bottom Profile/Status (Optional Gen Z addition) */}
      <div className="p-4 mt-auto">
        <div className="bg-white border border-zinc-200 rounded-2xl p-3 shadow-sm flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-zinc-900 truncate">System Status</p>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-tight">All systems go</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
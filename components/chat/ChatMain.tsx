"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { Message } from "@/types";
import { Loader2, Hash, Info, Users } from "lucide-react";

interface ChatMainProps {
  sectionName: string;
  sectionDescription?: string;
  messages: Message[];
  isLoading: boolean;
}

export function ChatMain({
  sectionName,
  sectionDescription,
  messages,
  isLoading,
}: ChatMainProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="flex flex-1 flex-col h-full bg-[#FBFBFB] overflow-hidden">
      {/* Premium Sticky Header */}
      <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-zinc-200 bg-white/80 px-8 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-900 text-white shadow-lg shadow-zinc-200">
            <Hash size={22} strokeWidth={3} />
          </div>
          <div className="flex flex-col">
            <h2 className="text-xl font-bold tracking-tight text-zinc-900 leading-none mb-1">
              {sectionName}
            </h2>
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
              <p className="text-xs font-medium text-zinc-400 truncate max-w-[400px]">
                {sectionDescription || "Discussion thread and community updates"}
              </p>
            </div>
          </div>
        </div>

        {/* Action Icons */}
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-600 hover:bg-zinc-50 transition-all">
            <Users size={14} />
            Show Members
          </button>
          <button className="p-2 text-zinc-400 hover:text-zinc-900 transition-colors">
            <Info size={20} />
          </button>
        </div>
      </header>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-900" />
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Syncing Threads...</p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-zinc-50 border border-zinc-100">
                <Hash size={32} className="text-zinc-200" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900">Welcome to #{sectionName}</h3>
              <p className="mt-2 text-sm font-medium text-zinc-500 leading-relaxed">
                This is the very beginning of the <span className="text-zinc-900 font-bold">#{sectionName}</span> channel. Be the first to start the conversation.
              </p>
              <button className="mt-6 text-xs font-bold text-zinc-400 uppercase tracking-widest hover:text-zinc-900 transition-colors">
                View Channel Guidelines
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto space-y-2">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} className="h-4" />
          </div>
        )}
      </div>
    </div>
  );
}
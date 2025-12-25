"use client";

import type { TypingIndicator } from "@/lib/types";

interface TypingIndicatorProps {
  users: TypingIndicator[];
}

export function TypingIndicatorComponent({ users }: TypingIndicatorProps) {
  if (users.length === 0) return <div className="h-6" />; // Keep height stable

  return (
    <div className="flex items-center gap-2 px-5 text-[#b9bbbe] text-sm font-medium h-6">
      <div className="flex gap-1">
        {[0, 150, 300].map((delay) => (
          <span 
            key={delay}
            className="w-2 h-2 bg-[#b9bbbe] rounded-full animate-pulse" 
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
      <span className="truncate max-w-full">
        {users.length > 1 ? "Several people are typing..." : `${users[0].userName} is typing...`}
      </span>
    </div>
  );
}
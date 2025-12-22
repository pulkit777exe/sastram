"use client";

import type { TypingIndicator } from "@/lib/types";

interface TypingIndicatorProps {
  users: TypingIndicator[];
}

export function TypingIndicatorComponent({ users }: TypingIndicatorProps) {
  if (users.length === 0) return null;

  const displayText = (() => {
    if (users.length === 1) {
      return `${users[0].userName} is typing`;
    } else if (users.length === 2) {
      return `${users[0].userName} and ${users[1].userName} are typing`;
    } else if (users.length === 3) {
      return `${users[0].userName}, ${users[1].userName}, and ${users[2].userName} are typing`;
    } else {
      return `${users[0].userName}, ${users[1].userName}, and ${
        users.length - 2
      } more are typing`;
    }
  })();

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
      <div className="flex gap-1">
        <span className="animate-pulse" style={{ animationDelay: "0ms" }}>
          ●
        </span>
        <span className="animate-pulse" style={{ animationDelay: "150ms" }}>
          ●
        </span>
        <span className="animate-pulse" style={{ animationDelay: "300ms" }}>
          ●
        </span>
      </div>
      <span className="text-xs">{displayText}...</span>
    </div>
  );
}

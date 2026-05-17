'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Message } from '@/lib/types/index';

interface ThreadContextValue {
  threadId: string;
  currentUser: {
    id: string;
    name: string | null;
    image: string | null;
    role?: string;
  };
  activeReplyId: string | null;
  collapsedIds: Set<string>;
  onReply: (messageId: string) => void;
  onCancelReply: () => void;
  onToggleCollapse: (messageId: string) => void;
  onMessagePosted: (message: Message) => void;
  onFocusBranch: (messageId: string) => void;
  onMessageUpdate: (messageId: string, updates: Partial<Message>) => void;
  allMessages: Message[];
  animateMessageId: string | null;
  aiInlineStatus: Record<string, 'pending' | 'failed'>;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
}

const ThreadContext = createContext<ThreadContextValue | null>(null);

export function ThreadProvider({ value, children }: { value: ThreadContextValue; children: ReactNode }) {
  return <ThreadContext.Provider value={value}>{children}</ThreadContext.Provider>;
}

export function useThreadContext(): ThreadContextValue {
  const ctx = useContext(ThreadContext);
  if (!ctx) {
    throw new Error('useThreadContext must be used within a ThreadProvider');
  }
  return ctx;
}

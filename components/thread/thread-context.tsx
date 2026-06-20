'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Message } from '@/lib/types/index';

// Stable context: rarely-changing thread data (threadId, currentUser, callbacks)
interface ThreadDataContextValue {
  threadId: string;
  currentUser: {
    id: string;
    name: string | null;
    image: string | null;
    role?: string;
  };
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onReply: (messageId: string) => void;
  onCancelReply: () => void;
  onToggleCollapse: (messageId: string) => void;
  onMessagePosted: (message: Message) => void;
  onFocusBranch: (messageId: string) => void;
  onMessageUpdate: (messageId: string, updates: Partial<Message>) => void;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
}

// UI state context: frequently-changing data (messages, reply state, animations)
interface ThreadUIStateContextValue {
  activeReplyId: string | null;
  collapsedIds: Set<string>;
  allMessages: Message[];
  animateMessageId: string | null;
  aiInlineStatus: Record<string, 'pending' | 'failed'>;
}

const ThreadDataContext = createContext<ThreadDataContextValue | null>(null);
const ThreadUIStateContext = createContext<ThreadUIStateContextValue | null>(null);

export function ThreadDataProvider({ value, children }: { value: ThreadDataContextValue; children: ReactNode }) {
  return <ThreadDataContext.Provider value={value}>{children}</ThreadDataContext.Provider>;
}

export function ThreadUIStateProvider({ value, children }: { value: ThreadUIStateContextValue; children: ReactNode }) {
  return <ThreadUIStateContext.Provider value={value}>{children}</ThreadUIStateContext.Provider>;
}

export function useThreadDataContext(): ThreadDataContextValue {
  const ctx = useContext(ThreadDataContext);
  if (!ctx) {
    throw new Error('useThreadDataContext must be used within a ThreadDataProvider');
  }
  return ctx;
}

export function useThreadUIStateContext(): ThreadUIStateContextValue {
  const ctx = useContext(ThreadUIStateContext);
  if (!ctx) {
    throw new Error('useThreadUIStateContext must be used within a ThreadUIStateProvider');
  }
  return ctx;
}

// Combined hook for components that need both contexts (e.g., CommentNode)
export function useThreadContext(): ThreadDataContextValue & ThreadUIStateContextValue {
  const data = useThreadDataContext();
  const ui = useThreadUIStateContext();
  return { ...data, ...ui };
}

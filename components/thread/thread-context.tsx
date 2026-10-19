'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { AiInlineMeta, Message } from '@/lib/types/index';
import type { AiInlineStatusMap } from '@/hooks/thread/ai-inline-status';

// Stable context: rarely-changing thread data (threadId, currentUser, callbacks)
interface ThreadDataContextValue {
  threadId: string;
  /** Thread creator id — feeds pin/delete view predicates (null when unknown). */
  createdBy: string | null;
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
  onMessagePosted: (message: Message, meta?: AiInlineMeta) => void;
  onOptimisticMessage?: (message: Message) => void;
  onFocusBranch: (messageId: string) => void;
  onMessageUpdate: (messageId: string, updates: Partial<Message>) => void;
}

// UI state context: interaction state (reply state, animations, AI status).
// The message list itself is passed as a prop so SSE token updates do not
// fan out through context to every MessageRow.
interface ThreadUIStateContextValue {
  activeReplyId: string | null;
  collapsedIds: Set<string>;
  animateMessageId: string | null;
  aiInlineStatus: AiInlineStatusMap;
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

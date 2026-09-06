'use client';

import { createContext, use, useMemo } from 'react';
import { useSearchConversation as useSearchConversationLogic } from './use-search-conversation';
import type { ChatMessage, AppState } from './use-search-conversation';
import type { SearchConfig } from '@/modules/ai-search/types';
import type { HistoryItem } from '@/components/ai-search/sai-search-layout';

// ------------------------------------------------------------------
// Generic context interface — state / actions / meta per
// vercel-composition-patterns: state-context-interface + state-lift-state
// ------------------------------------------------------------------

export interface SearchState {
  appState: AppState;
  query: string;
  lastConfig: SearchConfig;
  errorMessage: string;
  isStreaming: boolean;
  slowHint: boolean;
  isOffline: boolean;
  currentSessionId?: string;
  currentStep: number;
  taskFailed: boolean;
  messages: ChatMessage[];
  streamingMessage: ChatMessage | null;
  // derived — not stored, avoids extra renders (rerender-derived-state)
  isChatActive: boolean;
}

export interface SearchActions {
  setQuery: (q: string) => void;
  run: (q: string, config: SearchConfig, sessionId?: string) => Promise<void>;
  newSearch: (initial: string) => void;
  selectSession: (item: HistoryItem) => void;
  abort: () => void;
}

export interface SearchMeta {
  // inputRef etc — placeholder for future focus management (meta bag)
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export interface SearchContextValue {
  state: SearchState;
  actions: SearchActions;
  meta: SearchMeta;
}

const SearchContext = createContext<SearchContextValue | null>(null);

/**
 * Provider is the only place that knows how state is managed
 * (state-decouple-implementation). UI components consume the context
 * interface — they don't know if state comes from useState, Zustand,
 * or server sync. Two providers can implement the same interface:
 *   - PersistedSearchProvider (wraps AiSearchSession)
 *   - EphemeralSearchProvider (local-only)
 * but the same composed UI works with both.
 */
export function SearchProvider({
  children,
  initialQuery = '',
}: {
  children: React.ReactNode;
  initialQuery?: string;
}) {
  const logic = useSearchConversationLogic(initialQuery);

  // rerender-derived-state: compute once, not via effect
  const isChatActive = logic.messages.length > 0 || logic.streamingMessage !== null;

  // rerender-memo: stable context value — only changes when deps change,
  // prevents ChatMessageList re-rendering on query keystrokes alone
  const value = useMemo<SearchContextValue>(
    () => ({
      state: {
        appState: logic.appState,
        query: logic.query,
        lastConfig: logic.lastConfig,
        errorMessage: logic.errorMessage,
        isStreaming: logic.isStreaming,
        slowHint: logic.slowHint,
        isOffline: logic.isOffline,
        currentSessionId: logic.currentSessionId,
        currentStep: logic.currentStep,
        taskFailed: logic.taskFailed,
        messages: logic.messages,
        streamingMessage: logic.streamingMessage,
        isChatActive,
      },
      actions: {
        setQuery: logic.setQuery,
        run: logic.run,
        newSearch: logic.newSearch,
        selectSession: logic.selectSession,
        abort: logic.abort,
      },
      meta: {},
    }),
    [
      logic.appState,
      logic.query,
      logic.lastConfig,
      logic.errorMessage,
      logic.isStreaming,
      logic.slowHint,
      logic.isOffline,
      logic.currentSessionId,
      logic.currentStep,
      logic.taskFailed,
      logic.messages,
      logic.streamingMessage,
      isChatActive,
      logic.setQuery,
      logic.run,
      logic.newSearch,
      logic.selectSession,
      logic.abort,
    ]
  );

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

/**
 * Consume via use() (React 19) — replaces useContext per react19-no-forwardref.
 * Throws if used outside provider — fail closed like canAccessThread.
 */
export function useSearch(): SearchContextValue {
  const ctx = use(SearchContext);
  if (!ctx) throw new Error('useSearch must be used within SearchProvider');
  return ctx;
}

// Re-export types for compound consumers
export type { ChatMessage, AppState };

'use client';

// Thin shim — single source of truth is use-search-conversation.
// Previously this file duplicated ~400 LOC (95% overlap) including
// PHASE_SLOW_MS / PHASE_TO_STEP and the full SSE handling.
// Now it re-exports the deep module to avoid drift and keep KISS.

export type { ChatMessage, AppState } from './use-search-conversation';
export {
  DEFAULT_CONFIG,
  SEARCH_PHASES,
  PHASE_SLOW_MS,
  PHASE_TO_STEP,
} from './use-search-conversation';

// Primary export — consumers that need streaming hook should import
// useSearchConversation directly; this alias preserves the old name
// without duplicating implementation.
export { useSearchConversation as useSearchStream } from './use-search-conversation';

// ------------------------------------------------------------------
// Backward-compat type shims (no runtime duplication).
// Kept so existing `import type { ... } from './use-search-stream'`
// sites and any future controlled-component wrapper continue to type-check.
// ------------------------------------------------------------------
import type { ChatMessage, AppState } from './use-search-conversation';
import type { SearchConfig } from '@/modules/ai-search/types';
import type { HistoryItem } from '@/components/ai-search/sai-search-layout';

export interface SearchStreamState {
  appState: AppState;
  query: string;
  lastConfig: SearchConfig;
  errorMessage: string;
  isStreaming: boolean;
  slowHint: boolean;
  isOffline: boolean;
  currentSessionId: string | undefined;
  currentStep: number;
  taskFailed: boolean;
  messages: ChatMessage[];
  streamingMessage: ChatMessage | null;
}

export interface UseSearchStreamActions {
  runSearch: (q: string, config: SearchConfig, sessionId?: string) => Promise<void>;
  handleNewSearch: (initialQuery: string) => void;
  handleSelectSession: (item: HistoryItem) => void;
  abortSearch: () => void;
}

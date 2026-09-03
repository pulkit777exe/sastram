'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { toasts } from '@/lib/utils/toast';
import type { SSEPhase } from '@/components/ai-search/PhaseTracker';
import type { HistoryItem } from '@/components/ai-search/sai-search-layout';
import { getStoredApiKeys } from '@/components/ai-search/ApiKeysModal';
import { parseSSE } from '@/lib/utils/sse';
import type { SearchConfig, Source, SynthesisResult, Citation } from '@/modules/ai-search/types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  query: string;
  text?: string;
  sources?: Source[];
  citations?: Citation[];
  followUps?: string[];
  conflictData?: SynthesisResult['conflictData'];
  queryType?: SynthesisResult['queryType'];
  sourceCount?: number;
  timestamp: number;
}

export type AppState = 'idle' | 'loading' | 'results' | 'error' | 'blocked';

export const DEFAULT_CONFIG: SearchConfig = {
  exaMode: 'agentic',
  tavilyMode: 'search',
  sourceFilter: 'all',
  searchMode: 'standard',
};

export const SEARCH_PHASES: { id: string; label: string }[] = [
  { id: 'searching', label: 'Searching' },
  { id: 'reading', label: 'Reading' },
  { id: 'crossref', label: 'Cross-referencing' },
  { id: 'synthesizing', label: 'Synthesizing' },
];

export const PHASE_SLOW_MS: Record<string, number> = {
  searching: 12_000,
  reading: 12_000,
  crossref: 12_000,
  synthesizing: 25_000,
};

export const PHASE_TO_STEP: Record<string, number> = {
  searching: 0,
  reading: 1,
  crossref: 2,
  synthesizing: 3,
};

// ------------------------------------------------------------------
// Helpers — each <30 lines, named for KISS readability.
// Single owner for constants above: use-search-stream imports from here.
// ------------------------------------------------------------------

export function toApiMessage(m: ChatMessage): { role: string; content: string } {
  return { role: m.role, content: m.text || m.query };
}

export function buildConversationHistory(messages: ChatMessage[]): { role: string; content: string }[] {
  const result: { role: string; content: string }[] = [];
  const start = Math.max(0, messages.length - 10);
  for (let i = start; i < messages.length; i++) {
    result.push(toApiMessage(messages[i]!));
  }
  return result;
}

export function createUserMessage(query: string): ChatMessage {
  return { id: crypto.randomUUID(), role: 'user', query, timestamp: Date.now() };
}

export function createAssistantMessage(query: string): ChatMessage {
  return { id: crypto.randomUUID(), role: 'assistant', query, timestamp: Date.now() };
}

export function createStreamingMessage(id: string, query: string): ChatMessage {
  return { id, role: 'assistant', query, timestamp: Date.now() };
}

export function validateQuery(q: string): string | null {
  const trimmed = q.trim();
  if (!trimmed || trimmed.length < 3) {
    toasts.error('Query too short', 'Please enter at least 3 characters.');
    return null;
  }
  if (trimmed.length > 500) {
    toasts.error('Query too long', 'Please keep your query under 500 characters.');
    return null;
  }
  return trimmed;
}

export function getApiKeysOrNotify(): { exa: string; tavily: string; gemini: string } | null {
  const keys = getStoredApiKeys();
  if (!keys.exa || !keys.tavily || !keys.gemini) {
    toasts.error('Please configure your API keys first', 'Click the API Keys button to get started.');
    return null;
  }
  return keys as { exa: string; tavily: string; gemini: string };
}

// ViewTransition in React 19 only animates async state changes.
// Wrapping state updates in startTransition is what lets the
// <ViewTransition> wrappers in SearchField / InputBar / SynthesisCard fire.
// This helper keeps that premature optimization explicit and documented
// instead of sprinkling raw startTransition calls through the hook.
// We preserve the behavior but make the intent obvious; do not delete.
export function triggerViewTransition(
  startTransition: (fn: () => void) => void,
  updater: () => void
): void {
  startTransition(updater);
}

export function getSlowLimit(phase: string): number {
  return PHASE_SLOW_MS[phase] ?? 15_000;
}

export function parseSSELine(data: string): {
  phase: SSEPhase | 'blocked' | 'done' | 'error';
  sources?: Source[];
  synthesis?: SynthesisResult;
  followUps?: string[];
  message?: string;
  sessionId?: string;
  suggestion?: string;
} | null {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function buildRequestBody(
  query: string,
  config: SearchConfig,
  keys: { exa: string; tavily: string; gemini: string },
  conversationHistory: { role: string; content: string }[],
  sessionId?: string
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    query,
    config,
    keys: { exa: keys.exa || undefined, tavily: keys.tavily || undefined, gemini: keys.gemini || undefined },
    conversationHistory,
  };
  if (sessionId) body.sessionId = sessionId;
  return body;
}

export function handleStatusError(status: number, response: Response, ctx: { setAppState: (s: AppState) => void; setErrorMessage: (s: string) => void; setStreamingMessage: (s: ChatMessage | null) => void; clearStreaming: () => void }): boolean {
  if (status === 401) { toasts.error('Authentication required', 'Please sign in again.'); ctx.setAppState('idle'); ctx.clearStreaming(); return true; }
  if (status === 415) { ctx.setErrorMessage('Unsupported request format.'); ctx.setAppState('error'); ctx.clearStreaming(); return true; }
  if (status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    toasts.error('Rate limit exceeded', retryAfter ? `Please wait ${retryAfter} seconds.` : 'Please wait a moment before searching again.');
    ctx.setAppState('idle'); ctx.clearStreaming(); return true;
  }
  if (status === 503) { toasts.error('Service unavailable', 'AI features are temporarily over quota. Try again later.'); ctx.setAppState('error'); ctx.setErrorMessage('AI features are temporarily unavailable due to high demand.'); ctx.clearStreaming(); return true; }
  return false;
}

export function buildFinalizedMessage(
  base: ChatMessage,
  event: { synthesis?: SynthesisResult; sources?: Source[]; followUps?: string[] }
): ChatMessage {
  return {
    ...base,
    text: event.synthesis?.text || event.synthesis?.content || base.text,
    sources: event.sources ?? base.sources,
    citations: event.synthesis?.citations,
    followUps: event.followUps,
    conflictData: event.synthesis?.conflictData,
    queryType: event.synthesis?.queryType,
    sourceCount: event.synthesis?.sourceCount,
  };
}

function handleProgressPhase(phase: string, sources: Source[] | undefined, ctx: { streamingDataRef: React.MutableRefObject<ChatMessage | null>; setStreamingMessage: React.Dispatch<React.SetStateAction<ChatMessage | null>>; setCurrentStep: (n: number) => void; setSlowHint: (b: boolean) => void; armSlowTimer: (p: string) => void }): void {
  ctx.setSlowHint(false); ctx.armSlowTimer(phase); ctx.setCurrentStep(PHASE_TO_STEP[phase] ?? 0);
  if (ctx.streamingDataRef.current && sources) { ctx.streamingDataRef.current = { ...ctx.streamingDataRef.current, sources }; ctx.setStreamingMessage((prev) => (prev ? { ...prev, sources } : prev)); }
}

function handleDonePhase(event: { sessionId?: string; synthesis?: SynthesisResult; sources?: Source[]; followUps?: string[] }, ctx: { streamingDataRef: React.MutableRefObject<ChatMessage | null>; sessionIdRef: React.MutableRefObject<string | undefined>; setCurrentSessionId: (s: string | undefined) => void; setStreamingMessage: React.Dispatch<React.SetStateAction<ChatMessage | null>>; setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>; setCurrentStep: (n: number) => void; setAppState: (s: AppState) => void; setIsStreaming: (b: boolean) => void; phaseTimerRef: React.MutableRefObject<Set<ReturnType<typeof setTimeout>>> }): void {
  ctx.phaseTimerRef.current.forEach(clearTimeout); ctx.phaseTimerRef.current.clear(); ctx.setCurrentStep(SEARCH_PHASES.length);
  if (event.sessionId) { ctx.sessionIdRef.current = event.sessionId; ctx.setCurrentSessionId(event.sessionId); }
  if (ctx.streamingDataRef.current) { const finalized = buildFinalizedMessage(ctx.streamingDataRef.current, event); ctx.streamingDataRef.current = null; ctx.setStreamingMessage(null); ctx.setMessages((msgs) => [...msgs, finalized]); }
  ctx.setAppState('results'); ctx.setIsStreaming(false);
}

function handleBlockedPhase(message: string | undefined, ctx: { streamingDataRef: React.MutableRefObject<ChatMessage | null>; setStreamingMessage: React.Dispatch<React.SetStateAction<ChatMessage | null>>; setErrorMessage: (s: string) => void; setAppState: (s: AppState) => void; setIsStreaming: (b: boolean) => void; setTaskFailed: (b: boolean) => void }): void {
  ctx.setTaskFailed(true); ctx.setErrorMessage(message || 'Search blocked by quota or usage cap.'); ctx.streamingDataRef.current = null; ctx.setStreamingMessage(null); ctx.setAppState('blocked'); ctx.setIsStreaming(false);
}
function handleStreamErrorPhase(message: string | undefined, ctx: { streamingDataRef: React.MutableRefObject<ChatMessage | null>; setStreamingMessage: React.Dispatch<React.SetStateAction<ChatMessage | null>>; setErrorMessage: (s: string) => void; setAppState: (s: AppState) => void; setIsStreaming: (b: boolean) => void; setTaskFailed: (b: boolean) => void }): void {
  ctx.setTaskFailed(true); ctx.setErrorMessage(message || 'Search failed.'); ctx.streamingDataRef.current = null; ctx.setStreamingMessage(null); ctx.setAppState('error'); ctx.setIsStreaming(false); toasts.error('Search failed');
}

function dispatchStreamEvent(event: ReturnType<typeof parseSSELine> & object, ctx: { streamingDataRef: React.MutableRefObject<ChatMessage | null>; sessionIdRef: React.MutableRefObject<string | undefined>; phaseTimerRef: React.MutableRefObject<Set<ReturnType<typeof setTimeout>>>; setStreamingMessage: React.Dispatch<React.SetStateAction<ChatMessage | null>>; setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>; setCurrentSessionId: (s: string | undefined) => void; setCurrentStep: (n: number) => void; setAppState: (s: AppState) => void; setIsStreaming: (b: boolean) => void; setSlowHint: (b: boolean) => void; setTaskFailed: (b: boolean) => void; setErrorMessage: (s: string) => void; armSlowTimer: (p: string) => void }): void {
  if (!event) return;
  switch (event.phase) {
    case 'searching': case 'reading': case 'crossref': case 'synthesizing':
      handleProgressPhase(event.phase, event.sources, { streamingDataRef: ctx.streamingDataRef, setStreamingMessage: ctx.setStreamingMessage, setCurrentStep: ctx.setCurrentStep, setSlowHint: ctx.setSlowHint, armSlowTimer: ctx.armSlowTimer }); break;
    case 'done': handleDonePhase(event as never, { streamingDataRef: ctx.streamingDataRef, sessionIdRef: ctx.sessionIdRef, setCurrentSessionId: ctx.setCurrentSessionId, setStreamingMessage: ctx.setStreamingMessage, setMessages: ctx.setMessages, setCurrentStep: ctx.setCurrentStep, setAppState: ctx.setAppState, setIsStreaming: ctx.setIsStreaming, phaseTimerRef: ctx.phaseTimerRef }); break;
    case 'blocked': handleBlockedPhase(event.message, { streamingDataRef: ctx.streamingDataRef, setStreamingMessage: ctx.setStreamingMessage, setErrorMessage: ctx.setErrorMessage, setAppState: ctx.setAppState, setIsStreaming: ctx.setIsStreaming, setTaskFailed: ctx.setTaskFailed }); break;
    case 'error': handleStreamErrorPhase(event.message, { streamingDataRef: ctx.streamingDataRef, setStreamingMessage: ctx.setStreamingMessage, setErrorMessage: ctx.setErrorMessage, setAppState: ctx.setAppState, setIsStreaming: ctx.setIsStreaming, setTaskFailed: ctx.setTaskFailed }); break;
  }
}
async function handleStream(body: ReadableStream<Uint8Array>, ctx: { streamingDataRef: React.MutableRefObject<ChatMessage | null>; sessionIdRef: React.MutableRefObject<string | undefined>; phaseTimerRef: React.MutableRefObject<Set<ReturnType<typeof setTimeout>>>; setStreamingMessage: React.Dispatch<React.SetStateAction<ChatMessage | null>>; setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>; setCurrentSessionId: (s: string | undefined) => void; setCurrentStep: (n: number) => void; setAppState: (s: AppState) => void; setIsStreaming: (b: boolean) => void; setSlowHint: (b: boolean) => void; setTaskFailed: (b: boolean) => void; setErrorMessage: (s: string) => void; armSlowTimer: (p: string) => void }): Promise<void> {
  const reader = body.getReader(); const decoder = new TextDecoder(); let buffer = '';
  while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const { events, remaining } = parseSSE(buffer); buffer = remaining; for (const { data } of events) { const event = parseSSELine(data); if (!event) continue; dispatchStreamEvent(event, ctx); } }
}

function handleCatchError(error: unknown, ctx: { setErrorMessage: (s: string) => void; setIsOffline: (b: boolean) => void; setAppState: (s: AppState) => void; setIsStreaming: (b: boolean) => void; setTaskFailed: (b: boolean) => void; setStreamingMessage: React.Dispatch<React.SetStateAction<ChatMessage | null>>; streamingDataRef: React.MutableRefObject<ChatMessage | null>; phaseTimerRef: React.MutableRefObject<Set<ReturnType<typeof setTimeout>>> }): void {
  ctx.phaseTimerRef.current.forEach(clearTimeout); ctx.phaseTimerRef.current.clear(); ctx.setTaskFailed(true);
  if (error instanceof DOMException && error.name === 'AbortError') ctx.setErrorMessage('Request timed out. Please try again with a simpler query.');
  else if (typeof navigator !== 'undefined' && !navigator.onLine) { ctx.setIsOffline(true); ctx.setErrorMessage('You appear to be offline. Check your connection and try again.'); }
  else ctx.setErrorMessage('Network error. Please check your connection and try again.');
  ctx.setAppState('error'); ctx.setIsStreaming(false); ctx.streamingDataRef.current = null; ctx.setStreamingMessage(null); toasts.error('Search failed');
}

/**
 * Deep module — one interface, lots of implementation behind the seam.
 * Hides: messages, streamingMessage, sessionIdRef, phase timers, abort,
 *        conversationHistory slicing, ApiKeys guard, SSE parsing.
 * Callers and tests cross the same seam: run(q, cfg) → state transitions.
 */
export function useSearchConversation(initialQuery: string = '') {
  const [appState, setAppState] = useState<AppState>('idle');
  const [query, setQuery] = useState(initialQuery);
  const [lastConfig, setLastConfig] = useState<SearchConfig>(DEFAULT_CONFIG);
  const [errorMessage, setErrorMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [slowHint, setSlowHint] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);
  const [currentStep, setCurrentStep] = useState(0);
  const [taskFailed, setTaskFailed] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessage | null>(null);
  const [, startTransition] = useTransition();

  const abortRef = useRef<AbortController | null>(null);
  const phaseTimerRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const sessionIdRef = useRef<string | undefined>(undefined);
  const streamingDataRef = useRef<ChatMessage | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const run = useCallback(
    async (q: string, config: SearchConfig, overrideSessionId?: string) => {
      const trimmed = validateQuery(q);
      if (!trimmed) return;
      const keys = getApiKeysOrNotify();
      if (!keys) return;

      setQuery(trimmed);
      setLastConfig(config);
      setErrorMessage('');

      triggerViewTransition(startTransition, () => {
        setAppState('loading');
        setIsStreaming(true);
        setSlowHint(false);
        setCurrentStep(0);
        setTaskFailed(false);
        if (typeof navigator !== 'undefined') setIsOffline(!navigator.onLine);
      });

      const userMsg = createUserMessage(trimmed);
      triggerViewTransition(startTransition, () => {
        setMessages((prev) => [...prev, userMsg]);
      });

      const assistantMsg = createAssistantMessage(trimmed);
      streamingDataRef.current = assistantMsg;
      triggerViewTransition(startTransition, () => {
        setStreamingMessage(assistantMsg);
      });

      const controller = new AbortController();
      abortRef.current = controller;
      const clientTimeout = setTimeout(() => controller.abort(), 28_000);
      let slowTimer: ReturnType<typeof setTimeout> | null = null;
      const armSlowTimer = (phase: string) => {
        if (slowTimer) clearTimeout(slowTimer);
        slowTimer = setTimeout(() => setSlowHint(true), getSlowLimit(phase));
      };
      armSlowTimer('searching');

      try {
        const conversationHistory = buildConversationHistory(messagesRef.current);
        const effectiveSessionId = overrideSessionId ?? sessionIdRef.current;
        const body = buildRequestBody(trimmed, config, keys, conversationHistory, effectiveSessionId);

        const response = await fetch('/api/ai/forum-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(clientTimeout);
        if (slowTimer) clearTimeout(slowTimer);

        const statusHandled = handleStatusError(response.status, response, {
          setAppState,
          setErrorMessage,
          setStreamingMessage,
          clearStreaming: () => {
            streamingDataRef.current = null;
            setStreamingMessage(null);
          },
        });
        if (statusHandled) return;

        if (!response.ok || !response.body) {
          const data = await response.json().catch(() => ({}));
          const msg =
            (data?.error && typeof data.error === 'object' && data.error.message) ||
            (typeof data?.error === 'string' ? data.error : null) ||
            `Search failed (${response.status}). Please try again.`;
          setErrorMessage(typeof msg === 'string' ? msg : 'Search failed. Please try again.');
          setAppState('error');
          streamingDataRef.current = null;
          setStreamingMessage(null);
          toasts.error('Search failed');
          return;
        }

        await handleStream(response.body, {
          streamingDataRef,
          sessionIdRef,
          phaseTimerRef,
          setStreamingMessage,
          setMessages,
          setCurrentSessionId,
          setCurrentStep,
          setAppState,
          setIsStreaming,
          setSlowHint,
          setTaskFailed,
          setErrorMessage,
          armSlowTimer,
        });
      } catch (error) {
        clearTimeout(clientTimeout);
        if (slowTimer) clearTimeout(slowTimer);
        handleCatchError(error, {
          setErrorMessage,
          setIsOffline,
          setAppState,
          setIsStreaming,
          setTaskFailed,
          setStreamingMessage,
          streamingDataRef,
          phaseTimerRef,
        });
      }
    },
    []
  );

  const newSearch = useCallback(
    (initial: string) => {
      abortRef.current?.abort();
      phaseTimerRef.current.forEach(clearTimeout);
      phaseTimerRef.current.clear();
      setAppState('idle');
      setErrorMessage('');
      setSlowHint(false);
      setIsOffline(false);
      setCurrentSessionId(undefined);
      sessionIdRef.current = undefined;
      setCurrentStep(0);
      setTaskFailed(false);
      setQuery(initial);
      setMessages(() => []);
      streamingDataRef.current = null;
      setStreamingMessage(null);
    },
    []
  );

  const selectSession = useCallback(
    (item: HistoryItem) => {
      abortRef.current?.abort();
      setErrorMessage('');
      setSlowHint(false);
      setIsStreaming(false);
      setCurrentStep(SEARCH_PHASES.length);
      setTaskFailed(false);
      setCurrentSessionId(item.id);
      sessionIdRef.current = item.id;
      setAppState('results');
      streamingDataRef.current = null;
      setStreamingMessage(null);

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        query: item.query,
        timestamp: new Date(item.createdAt).getTime(),
      };
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        query: item.query,
        text: item.synthesis,
        sources: item.sources ?? [],
        citations: item.citations ?? [],
        followUps: item.followUps ?? [],
        conflictData: (item.conflictData as SynthesisResult['conflictData']) ?? {
          detected: false,
          description: '',
          sideA: '',
          sideB: '',
        },
        queryType: (item.queryType as SynthesisResult['queryType']) || 'technical',
        sourceCount: item.sourceCount,
        timestamp: new Date(item.createdAt).getTime(),
      };
      setMessages(() => [userMsg, assistantMsg]);
      setQuery(item.query);
    },
    []
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    appState,
    query,
    lastConfig,
    errorMessage,
    isStreaming,
    slowHint,
    isOffline,
    currentSessionId,
    currentStep,
    taskFailed,
    messages,
    streamingMessage,
    setQuery,
    run,
    newSearch,
    selectSession,
    abort,
  };
}

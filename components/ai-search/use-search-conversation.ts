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

const PHASE_SLOW_MS: Record<string, number> = {
  searching: 12_000,
  reading: 12_000,
  crossref: 12_000,
  synthesizing: 25_000,
};

const PHASE_TO_STEP: Record<string, number> = {
  searching: 0,
  reading: 1,
  crossref: 2,
  synthesizing: 3,
};

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
  // mirror messages to avoid stale closure in run — sync after render
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const run = useCallback(
    async (q: string, config: SearchConfig, overrideSessionId?: string) => {
      const trimmed = q.trim();
      if (!trimmed || trimmed.length < 3) {
        toasts.error('Query too short', 'Please enter at least 3 characters.');
        return;
      }
      if (trimmed.length > 500) {
        toasts.error('Query too long', 'Please keep your query under 500 characters.');
        return;
      }

      const keys = getStoredApiKeys();
      if (!keys.exa || !keys.tavily || !keys.gemini) {
        toasts.error('Please configure your API keys first', 'Click the API Keys button to get started.');
        return;
      }

      setQuery(trimmed);
      setLastConfig(config);
      setErrorMessage('');
      // Idle → active flip is wrapped in startTransition so React schedules it
      // asynchronously. That's what lets the <ViewTransition> wrappers in
      // SearchField / InputBar / SynthesisCard actually fire — the canary
      // <ViewTransition> only animates async state changes.
      startTransition(() => {
        setAppState('loading');
        setIsStreaming(true);
        setSlowHint(false);
        setCurrentStep(0);
        setTaskFailed(false);
        if (typeof navigator !== 'undefined') setIsOffline(!navigator.onLine);
      });

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        query: trimmed,
        timestamp: Date.now(),
      };
      // First user bubble mount also goes through the transition so the
      // shared-element morph with the idle composer fires.
      startTransition(() => {
        setMessages((prev) => [...prev, userMsg]);
      });

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        query: trimmed,
        timestamp: Date.now(),
      };
      streamingDataRef.current = assistantMsg;
      // First synthesis card reveal goes through the transition so the
      // <ViewTransition name="ai-search-first-synthesis"> fires onEnter.
      startTransition(() => {
        setStreamingMessage(assistantMsg);
      });

      const controller = new AbortController();
      abortRef.current = controller;
      const clientTimeout = setTimeout(() => controller.abort(), 28_000);
      let slowTimer: ReturnType<typeof setTimeout> | null = null;
      const armSlowTimer = (phase: string) => {
        if (slowTimer) clearTimeout(slowTimer);
        const limit = PHASE_SLOW_MS[phase] ?? 15_000;
        slowTimer = setTimeout(() => setSlowHint(true), limit);
      };
      armSlowTimer('searching');

      try {
        const conversationHistory = messagesRef.current.slice(-10).map((m) => ({
          role: m.role,
          content: m.text || m.query,
        }));

        const body: Record<string, unknown> = {
          query: trimmed,
          config,
          keys: {
            exa: keys.exa || undefined,
            tavily: keys.tavily || undefined,
            gemini: keys.gemini || undefined,
          },
          conversationHistory,
        };
        const effectiveSessionId = overrideSessionId ?? sessionIdRef.current;
        if (effectiveSessionId) body.sessionId = effectiveSessionId;

        const response = await fetch('/api/ai/forum-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(clientTimeout);
        if (slowTimer) clearTimeout(slowTimer);

        if (response.status === 401) {
          toasts.error('Authentication required', 'Please sign in again.');
          setAppState('idle');
          streamingDataRef.current = null;
          setStreamingMessage(null);
          return;
        }
        if (response.status === 415) {
          setErrorMessage('Unsupported request format.');
          setAppState('error');
          streamingDataRef.current = null;
          setStreamingMessage(null);
          return;
        }
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          toasts.error(
            'Rate limit exceeded',
            retryAfter ? `Please wait ${retryAfter} seconds.` : 'Please wait a moment before searching again.'
          );
          setAppState('idle');
          streamingDataRef.current = null;
          setStreamingMessage(null);
          return;
        }
        if (response.status === 503) {
          toasts.error('Service unavailable', 'AI features are temporarily over quota. Try again later.');
          setAppState('error');
          setErrorMessage('AI features are temporarily unavailable due to high demand.');
          streamingDataRef.current = null;
          setStreamingMessage(null);
          return;
        }
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

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const { events, remaining } = parseSSE(buffer);
          buffer = remaining;

          for (const { data } of events) {
            let event: {
              phase: SSEPhase | 'blocked';
              sources?: Source[];
              synthesis?: SynthesisResult;
              followUps?: string[];
              message?: string;
              sessionId?: string;
              suggestion?: string;
            };
            try {
              event = JSON.parse(data);
            } catch {
              continue;
            }

            switch (event.phase) {
              case 'searching':
              case 'reading':
              case 'crossref':
              case 'synthesizing': {
                setSlowHint(false);
                armSlowTimer(event.phase);
                setCurrentStep(PHASE_TO_STEP[event.phase] ?? 0);
                const sources = event.sources;
                if (streamingDataRef.current && sources) {
                  streamingDataRef.current = { ...streamingDataRef.current, sources };
                  setStreamingMessage((prev) => (prev ? { ...prev, sources } : prev));
                }
                break;
              }
              case 'done':
                phaseTimerRef.current.forEach(clearTimeout);
                phaseTimerRef.current.clear();
                setCurrentStep(SEARCH_PHASES.length);
                if (event.sessionId) {
                  sessionIdRef.current = event.sessionId;
                  setCurrentSessionId(event.sessionId);
                }

                if (streamingDataRef.current) {
                  const finalized: ChatMessage = {
                    ...streamingDataRef.current,
                    text: event.synthesis?.text || event.synthesis?.content || streamingDataRef.current.text,
                    sources: event.sources ?? streamingDataRef.current.sources,
                    citations: event.synthesis?.citations,
                    followUps: event.followUps,
                    conflictData: event.synthesis?.conflictData,
                    queryType: event.synthesis?.queryType,
                    sourceCount: event.synthesis?.sourceCount,
                  };
                  streamingDataRef.current = null;
                  setStreamingMessage(null);
                  setMessages((msgs) => [...msgs, finalized]);
                }
                setAppState('results');
                setIsStreaming(false);
                break;
              case 'blocked':
                setTaskFailed(true);
                setErrorMessage(event.message || 'Search blocked by quota or usage cap.');
                streamingDataRef.current = null;
                setStreamingMessage(null);
                setAppState('blocked');
                setIsStreaming(false);
                break;
              case 'error':
                setTaskFailed(true);
                setErrorMessage(event.message || 'Search failed.');
                streamingDataRef.current = null;
                setStreamingMessage(null);
                setAppState('error');
                setIsStreaming(false);
                toasts.error('Search failed');
                break;
            }
          }
        }
      } catch (error) {
        clearTimeout(clientTimeout);
        if (slowTimer) clearTimeout(slowTimer);
        phaseTimerRef.current.forEach(clearTimeout);
        phaseTimerRef.current.clear();
        setTaskFailed(true);
        if (error instanceof DOMException && error.name === 'AbortError') {
          setErrorMessage('Request timed out. Please try again with a simpler query.');
        } else if (typeof navigator !== 'undefined' && !navigator.onLine) {
          setIsOffline(true);
          setErrorMessage('You appear to be offline. Check your connection and try again.');
        } else {
          setErrorMessage('Network error. Please check your connection and try again.');
        }
        setAppState('error');
        setIsStreaming(false);
        streamingDataRef.current = null;
        setStreamingMessage(null);
        toasts.error('Search failed');
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

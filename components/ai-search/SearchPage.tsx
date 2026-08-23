'use client';

import { useState, useCallback, useRef, useEffect, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import { toasts } from '@/lib/utils/toast';
import { motion } from 'framer-motion';
import { Clock, AlertCircle, Send, Loader2, Plus } from 'lucide-react';
import { SearchBox } from '@/components/ai-search/SearchBox';
import type { SSEPhase } from '@/components/ai-search/PhaseTracker';
import { SynthesisCard } from '@/components/ai-search/SynthesisCard';
import { ApiKeysModal, getStoredApiKeys, hasAllApiKeys } from '@/components/ai-search/ApiKeysModal';
import { SaiSearchLayout, type HistoryItem } from '@/components/ai-search/sai-search-layout';
import type { RetryStyle, FeedbackType } from '@/components/ai-search/StreamingText';
import { TaskSteps, type TaskStep } from '@/components/ai-search/TaskSteps';
import type { SearchConfig, Source, SynthesisResult, Citation } from '@/modules/ai-search/types';

const apiKeysListeners = new Set<() => void>();
function subscribeToApiKeys(cb: () => void) {
  apiKeysListeners.add(cb);
  return () => apiKeysListeners.delete(cb);
}
function getHasApiKeys() {
  return hasAllApiKeys();
}
function notifyApiKeysChanged(_hasAll?: boolean) {
  apiKeysListeners.forEach((fn) => fn());
}

type AppState = 'idle' | 'loading' | 'results' | 'error' | 'blocked';

const DEFAULT_CONFIG: SearchConfig = {
  exaMode: 'agentic',
  tavilyMode: 'search',
  sourceFilter: 'all',
  searchMode: 'standard',
};

const PHASE_SLOW_MS: Record<string, number> = {
  searching: 12_000,
  reading: 12_000,
  crossref: 12_000,
  synthesizing: 25_000,
};

const SEARCH_PHASES: TaskStep[] = [
  { id: 'searching', label: 'Searching' },
  { id: 'reading', label: 'Reading' },
  { id: 'crossref', label: 'Cross-referencing' },
  { id: 'synthesizing', label: 'Synthesizing' },
];

const PHASE_TO_STEP: Record<string, number> = {
  searching: 0,
  reading: 1,
  crossref: 2,
  synthesizing: 3,
};

interface ChatMessage {
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

interface SearchPageProps {
  user?: { name?: string | null; email?: string | null; image?: string | null } | null;
}

export function SearchPage({ user }: SearchPageProps) {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';

  const [appState, setAppState] = useState<AppState>('idle');
  const [query, setQuery] = useState(initialQuery);
  const [lastConfig, setLastConfig] = useState<SearchConfig>(DEFAULT_CONFIG);
  const [errorMessage, setErrorMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [slowHint, setSlowHint] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>();
  const [fromHistory, setFromHistory] = useState(false);

  const [currentStep, setCurrentStep] = useState(0);
  const [taskFailed, setTaskFailed] = useState(false);

  const [showApiKeys, setShowApiKeys] = useState(false);
  const hasKeys = useSyncExternalStore(subscribeToApiKeys, getHasApiKeys, () => false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessage | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const phaseTimerRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const streamingDataRef = useRef<ChatMessage | null>(null);

  useEffect(() => {
    sessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage, scrollToBottom]);

  const runSearch = useCallback(
    async (q: string, config: SearchConfig) => {
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
        toasts.error(
          'Please configure your API keys first',
          'Click the API Keys button to get started.'
        );
        setShowApiKeys(true);
        return;
      }

      setQuery(trimmed);
      setLastConfig(config);
      setErrorMessage('');
      setAppState('loading');
      setIsStreaming(true);
      setSlowHint(false);
      setFromHistory(false);
      setCurrentStep(0);
      setTaskFailed(false);
      if (typeof navigator !== 'undefined') setIsOffline(!navigator.onLine);

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        query: trimmed,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        query: trimmed,
        timestamp: Date.now(),
      };
      streamingDataRef.current = assistantMsg;
      setStreamingMessage(assistantMsg);

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
        const conversationHistory = messages.slice(-10).map((m) => ({
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
        if (currentSessionId) body.sessionId = currentSessionId;

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
            retryAfter
              ? `Please wait ${retryAfter} seconds.`
              : 'Please wait a moment before searching again.'
          );
          setAppState('idle');
          streamingDataRef.current = null;
          setStreamingMessage(null);
          return;
        }
        if (response.status === 503) {
          toasts.error(
            'Service unavailable',
            'AI features are temporarily over quota. Try again later.'
          );
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

          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const block of events) {
            const line = block.trim();
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;

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
              event = JSON.parse(payload);
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
                  setStreamingMessage((prev) =>
                    prev ? { ...prev, sources } : prev
                  );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sessionIdRef used instead of currentSessionId to avoid stale closure
    [messages]
  );

  const handleSearch = useCallback(
    (q: string, config: SearchConfig) => {
      runSearch(q, config);
    },
    [runSearch]
  );

  const handleFollowUp = useCallback(
    (followUp: string) => {
      runSearch(followUp, lastConfig);
    },
    [lastConfig, runSearch]
  );

  const handleRetry = useCallback(
    (style: RetryStyle) => {
      if (!query) return;
      const styledQuery =
        style === 'same' ? query : `${query} (Please provide a ${style} response)`;
      runSearch(styledQuery, lastConfig);
    },
    [query, lastConfig, runSearch]
  );

  const handleFeedback = useCallback((_type: FeedbackType, _reason?: string) => {
    // Feedback handled via toast in StreamingText
  }, []);

  const handleNewSearch = useCallback(() => {
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
    setQuery(initialQuery);
    setMessages([]);
    streamingDataRef.current = null;
    setStreamingMessage(null);
  }, [initialQuery]);

  const handleSelectSession = useCallback((item: HistoryItem) => {
    abortRef.current?.abort();
    setErrorMessage('');
    setSlowHint(false);
    setIsStreaming(false);
    setFromHistory(true);
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
    setMessages([userMsg, assistantMsg]);
    setQuery(item.query);
  }, []);

  const isChatActive = messages.length > 0 || streamingMessage !== null;

  return (
    <SaiSearchLayout
      onSelectSession={handleSelectSession}
      onNewSearch={handleNewSearch}
      currentSessionId={currentSessionId}
      hasApiKeys={hasKeys}
      onOpenApiKeys={() => setShowApiKeys(true)}
    >
      <div className="flex flex-col h-full">
        {/* Idle state: centered search */}
        {!isChatActive && appState === 'idle' && (
          <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-6 py-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center"
            >
              <div className="mb-8 text-center">
                <h1 className="text-2xl tracking-tight text-ink mb-4 font-serif-heading">
                  Search across Sastram
                </h1>
              </div>

              <div className="relative w-full max-w-2xl mb-8">
                <SearchBox
                  onSearch={handleSearch}
                  isLoading={false}
                  compact={false}
                  initialQuery={initialQuery}
                />
              </div>

              <div className="flex flex-wrap justify-center gap-2 max-w-2xl">
                {[
                  'What are the best patterns for managing state in React?',
                  'Latest threads on Hacker News about AI in healthcare.',
                  'Compare Arch Linux vs Debian for a developer machine.',
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleSearch(q, DEFAULT_CONFIG)}
                    className="px-3.5 py-2 text-xs text-ink-2 bg-surface border border-line rounded-card hover:border-line-strong hover:text-ink hover:bg-hover transition-all duration-150"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}

        {/* Chat state: messages + input */}
        {isChatActive && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Messages scroll area */}
            <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6">
              <div className="max-w-3xl mx-auto space-y-6">
                {messages.map((msg) => (
                  <ChatMessageBubble
                    key={msg.id}
                    message={msg}
                    onFollowUp={handleFollowUp}
                    onRetry={handleRetry}
                    onFeedback={handleFeedback}
                    isLatest={msg.id === messages[messages.length - 1]?.id}
                  />
                ))}

                {/* Streaming message */}
                {streamingMessage && appState === 'loading' && (
                  <div className="space-y-4">
                    <TaskSteps
                      steps={SEARCH_PHASES}
                      current={currentStep}
                      failed={taskFailed}
                      label="Search progress"
                    />

                    {slowHint && (
                      <p className="text-xs text-ink-2 animate-pulse">
                        This is taking longer than usual — still working on it…
                      </p>
                    )}

                    {streamingMessage.text && (
                      <SynthesisCard
                        text={streamingMessage.text}
                        citations={streamingMessage.citations}
                        sources={streamingMessage.sources}
                        conflictData={streamingMessage.conflictData}
                        sourceCount={streamingMessage.sourceCount ?? 0}
                        queryType={streamingMessage.queryType ?? 'technical'}
                        isStreaming={true}
                        fromHistory={false}
                      />
                    )}

                    {!streamingMessage.text && (
                      <div className="space-y-3">
                        <div className="bg-hover/50 rounded-card h-32 animate-pulse" />
                        <div className="bg-hover/50 rounded-card h-20 animate-pulse" />
                      </div>
                    )}
                  </div>
                )}

                {/* Blocked state */}
                {appState === 'blocked' && (
                  <div className="w-full flex flex-col items-center pt-8 pb-4 text-center">
                    <div className="w-12 h-12 rounded-full bg-hover flex items-center justify-center mb-4">
                      <Clock size={20} className="text-ink-2" />
                    </div>
                    <h2 className="text-lg font-semibold mb-2 text-ink">Search limit reached</h2>
                    <p className="text-sm text-ink-2 max-w-md mb-6">{errorMessage}</p>
                    <p className="text-xs text-ink-3">
                      This resets automatically — no need to retry right now.
                    </p>
                  </div>
                )}

                {/* Error state */}
                {appState === 'error' && (
                  <div className="w-full flex flex-col items-center pt-8 pb-4 text-center">
                    <div className="w-12 h-12 rounded-full bg-sai-red/10 flex items-center justify-center mb-4">
                      <AlertCircle size={20} className="text-sai-red" />
                    </div>
                    <h2 className="text-lg font-semibold mb-2 text-ink">
                      {isOffline ? "You're offline" : 'Something went wrong'}
                    </h2>
                    <p className="text-sm text-ink-2 max-w-md mb-6">{errorMessage}</p>
                    <button
                      type="button"
                      onClick={handleNewSearch}
                      className="px-4 py-2 text-sm font-medium bg-ink text-canvas rounded-card hover:opacity-90 transition-opacity"
                    >
                      {isOffline ? 'Retry when back online' : 'Try Again'}
                    </button>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Bottom search input */}
            <div className="border-t border-line bg-canvas px-4 md:px-6 py-4">
              <div className="max-w-3xl mx-auto">
                <div className="relative bg-surface border border-line rounded-card shadow-card overflow-hidden transition-shadow duration-150 focus-within:shadow-raised focus-within:border-line-strong">
                  <textarea
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (query.trim().length >= 3 && !isStreaming) {
                          runSearch(query, lastConfig);
                          e.currentTarget.style.height = 'auto';
                        }
                      }
                    }}
                    placeholder={isChatActive ? 'Ask a follow-up question...' : 'Search across Sastram...'}
                    rows={1}
                    className="w-full resize-none bg-transparent px-4 py-3 pr-14 text-sm text-ink placeholder:text-ink-3 focus:outline-none"
                    style={{ minHeight: '48px', maxHeight: '120px' }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (query.trim().length >= 3 && !isStreaming) {
                        runSearch(query, lastConfig);
                      }
                    }}
                    disabled={isStreaming || query.trim().length < 3}
                    className="absolute right-3 bottom-3 flex h-8 w-8 items-center justify-center rounded-control bg-sai-accent text-white transition-all duration-150 hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {isStreaming ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Send size={15} />
                    )}
                  </button>
                </div>
                {isChatActive && (
                  <button
                    type="button"
                    onClick={handleNewSearch}
                    className="mt-2.5 flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink transition-colors"
                  >
                    <Plus size={12} />
                    New conversation
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      <ApiKeysModal
        isOpen={showApiKeys}
        onClose={() => setShowApiKeys(false)}
        onKeysChange={notifyApiKeysChanged}
      />
    </SaiSearchLayout>
  );
}

function ChatMessageBubble({
  message,
  onFollowUp,
  onRetry,
  onFeedback,
  isLatest,
}: {
  message: ChatMessage;
  onFollowUp: (q: string) => void;
  onRetry: (style: RetryStyle) => void;
  onFeedback: (type: FeedbackType, reason?: string) => void;
  isLatest: boolean;
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-card bg-sai-accent-tint border border-sai-accent/20 px-4 py-2.5 text-sm text-ink">
          {message.query}
        </div>
      </div>
    );
  }

  if (!message.text) return null;

  const citations: Citation[] = message.citations ?? [];

  return (
    <div className="space-y-3">
      <SynthesisCard
        text={message.text}
        citations={citations}
        sources={message.sources}
        conflictData={message.conflictData}
        sourceCount={message.sourceCount ?? 0}
        queryType={message.queryType ?? 'technical'}
        isStreaming={false}
        fromHistory={true}
        onRetry={isLatest ? onRetry : undefined}
        onFeedback={isLatest ? onFeedback : undefined}
      />

      {isLatest && message.followUps && message.followUps.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {message.followUps.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onFollowUp(f)}
              className="group flex items-center gap-2 text-left text-sm text-ink bg-hover/50 border border-line/50 hover:border-line-strong rounded-card px-4 py-2.5 transition-colors"
            >
              <span className="flex-1">{f}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

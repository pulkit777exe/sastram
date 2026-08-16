'use client';

import { useState, useCallback, useRef, useMemo, useEffect, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import { toasts } from '@/lib/utils/toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  KeyRound,
  ArrowRight,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Clock,
  AlertCircle,
  Menu,
} from 'lucide-react';
import { SearchBox } from '@/components/ai-search/SearchBox';
import type { SSEPhase } from '@/components/ai-search/PhaseTracker';
import { SynthesisCard } from '@/components/ai-search/SynthesisCard';
import { SourceCard } from '@/components/ai-search/SourceCard';
import { TableView } from '@/components/ai-search/TableView';
import { ApiKeysModal, getStoredApiKeys, hasAllApiKeys } from '@/components/ai-search/ApiKeysModal';
import { SaiSearchLayout, type HistoryItem } from '@/components/ai-search/SaiSearchLayout';
import type { RetryStyle, FeedbackType } from '@/components/ai-search/StreamingText';
import { StepLogEntry, ThinkingTrace } from '@/components/ai-search/ThinkingTrace';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
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

type AppState = 'idle' | 'loading' | 'results' | 'refine' | 'error' | 'blocked';
type MobileTab = 'answer' | 'sources';

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

interface StreamState {
  phase: SSEPhase;
  sources: Source[];
  synthesis: SynthesisResult | null;
  followUps: string[];
  sessionId?: string;
  suggestion?: string;
}

interface SearchPageProps {
  user?: { name?: string | null; email?: string | null; image?: string | null } | null;
}

export function SearchPage({ user }: SearchPageProps) {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';

  const [appState, setAppState] = useState<AppState>('idle');
  const [stream, setStream] = useState<StreamState>({
    phase: 'searching',
    sources: [],
    synthesis: null,
    followUps: [],
  });
  const [query, setQuery] = useState(initialQuery);
  const [lastConfig, setLastConfig] = useState<SearchConfig>(DEFAULT_CONFIG);
  const [errorMessage, setErrorMessage] = useState('');
  const [mobileTab, setMobileTab] = useState<MobileTab>('answer');
  const [highlightedSourceId, setHighlightedSourceId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [slowHint, setSlowHint] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>();
  const [fromHistory, setFromHistory] = useState(false);

  const [stepLog, setStepLog] = useState<StepLogEntry[]>([]);
  const [completedAt, setCompletedAt] = useState<number | undefined>();
  const [startedAt, setStartedAt] = useState<number>(0);

  const [showApiKeys, setShowApiKeys] = useState(false);
  const hasKeys = useSyncExternalStore(subscribeToApiKeys, getHasApiKeys, () => false);
  const [showLowerQualitySources, setShowLowerQualitySources] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const isMobile = useSyncExternalStore(
    (callback) => {
      const mq = window.matchMedia('(max-width: 768px)');
      mq.addEventListener('change', callback);
      return () => mq.removeEventListener('change', callback);
    },
    () => window.matchMedia('(max-width: 768px)').matches,
    () => false
  );

  const sourceRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const phaseTimerRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const logStep = useCallback((phase: SSEPhase, sourceCount: number) => {
    setStepLog((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].phase === phase) return prev;
      return [...prev, { phase, at: Date.now(), sourceCount }];
    });
  }, []);

  const runSearch = useCallback(
    async (q: string, config: SearchConfig, context?: { query: string; followUp: string }) => {
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
      setHighlightedSourceId(null);
      setMobileTab('answer');
      setAppState('loading');
      setIsStreaming(true);
      setSlowHint(false);
      setFromHistory(false);
      setStartedAt(Date.now());
      setStepLog([]);
      setCompletedAt(undefined);
      if (typeof navigator !== 'undefined') setIsOffline(!navigator.onLine);
      setStream({ phase: 'searching', sources: [], synthesis: null, followUps: [] });

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
        const body: Record<string, unknown> = {
          query: trimmed,
          config,
          keys: {
            exa: keys.exa || undefined,
            tavily: keys.tavily || undefined,
            gemini: keys.gemini || undefined,
          },
        };
        if (context) {
          body.context = context;
          if (currentSessionId) body.parentSessionId = currentSessionId;
          body.clientNonce = crypto.randomUUID();
        }

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
          return;
        }
        if (response.status === 415) {
          setErrorMessage('Unsupported request format.');
          setAppState('error');
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
          return;
        }
        if (response.status === 503) {
          toasts.error(
            'Service unavailable',
            'AI features are temporarily over quota. Try again later.'
          );
          setAppState('error');
          setErrorMessage('AI features are temporarily unavailable due to high demand.');
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
                const nextSourceCount = (event.sources ?? stream.sources).length;
                logStep(event.phase, nextSourceCount);
                const phase = event.phase as SSEPhase;
                const sources = event.sources;
                setStream((prev) => ({
                  ...prev,
                  phase,
                  sources: sources ?? prev.sources,
                }));
                if (phase === 'reading') setMobileTab('sources');
                break;
              }
              case 'refine':
                setStream((prev) => ({
                  ...prev,
                  phase: 'refine',
                  sources: event.sources ?? prev.sources,
                  suggestion: event.suggestion,
                }));
                setAppState('refine');
                setIsStreaming(false);
                break;
              case 'done':
                phaseTimerRef.current.forEach(clearTimeout);
                phaseTimerRef.current.clear();
                setCompletedAt(Date.now());
                setStream((prev) => ({
                  ...prev,
                  phase: 'done',
                  synthesis: event.synthesis ?? prev.synthesis,
                  followUps: event.followUps ?? [],
                  sessionId: event.sessionId,
                  sources: event.sources ?? prev.sources,
                }));
                setCurrentSessionId(event.sessionId ?? currentSessionId);
                setAppState('results');
                setIsStreaming(false);
                break;
              case 'blocked':
                setCompletedAt(Date.now());
                setErrorMessage(event.message || 'Search blocked by quota or usage cap.');
                setAppState('blocked');
                setIsStreaming(false);
                break;
              case 'error':
                setCompletedAt(Date.now());
                setErrorMessage(event.message || 'Search failed.');
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
        setCompletedAt(Date.now());
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
        toasts.error('Search failed');
      }
    },
    [currentSessionId, logStep, stream.sources]
  );

  const handleSearch = useCallback(
    (q: string, config: SearchConfig) => {
      runSearch(q, config);
    },
    [runSearch]
  );

  const handleFollowUp = useCallback(
    (followUp: string) => {
      if (!query) return;
      runSearch(query, lastConfig, { query, followUp });
    },
    [query, lastConfig, runSearch]
  );

  const handleRefineSuggestion = useCallback(() => {
    const suggestion = stream.suggestion;
    if (!suggestion) return;
    setAppState('idle');
    setStream({ phase: 'searching', sources: [], synthesis: null, followUps: [] });
    setQuery(suggestion);
  }, [stream.suggestion]);

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
    // Feedback is handled via toast in StreamingText; extend here if backend logging is needed
  }, []);

  const handleNewSearch = useCallback(() => {
    abortRef.current?.abort();
    phaseTimerRef.current.forEach(clearTimeout);
    phaseTimerRef.current.clear();
    setAppState('idle');
    setStream({ phase: 'searching', sources: [], synthesis: null, followUps: [] });
    setErrorMessage('');
    setSlowHint(false);
    setIsOffline(false);
    setCurrentSessionId(undefined);
    setStepLog([]);
    setCompletedAt(undefined);
    setQuery(initialQuery);
  }, [initialQuery]);

  const handleSelectSession = useCallback((item: HistoryItem) => {
    abortRef.current?.abort();
    setQuery(item.query);
    setErrorMessage('');
    setMobileTab('answer');
    setHighlightedSourceId(null);
    setSlowHint(false);
    setIsStreaming(false);
    setFromHistory(true);
    setStepLog([]);
    setCompletedAt(undefined);
    setCurrentSessionId(item.id);
    setAppState('results');
    setStream({
      phase: 'done',
      sources: item.sources ?? [],
      synthesis: {
        content: item.synthesis,
        text: item.synthesis,
        citations: item.citations ?? [],
        queryType: (item.queryType as SynthesisResult['queryType']) || 'technical',
        sourceCount: item.sourceCount,
        conflictData: (item.conflictData as SynthesisResult['conflictData']) ?? {
          detected: false,
          description: '',
          sideA: '',
          sideB: '',
        },
        processingTimeMs: 0,
      },
      followUps: item.followUps ?? [],
      sessionId: item.id,
    });
  }, []);

  const handleCiteClick = useCallback((sourceId: string) => {
    setHighlightedSourceId(sourceId);
    setMobileTab('sources');
    const el = sourceRefs.current.get(sourceId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setHighlightedSourceId(null), 1600);
    }
  }, []);

  const synthesis = stream.synthesis;
  const citations: Citation[] = useMemo(() => synthesis?.citations ?? [], [synthesis]);

  return (
    <SaiSearchLayout
      onSelectSession={handleSelectSession}
      onNewSearch={handleNewSearch}
      currentSessionId={currentSessionId}
      hasApiKeys={hasKeys}
      onOpenApiKeys={() => setShowApiKeys(true)}
    >
      <div className="flex flex-col items-center justify-center min-h-full px-4 md:px-6 py-10">
        <AnimatePresence mode="wait">
          {appState === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center pt-16 sm:pt-24 pb-8 w-full"
            >
              <div className="mb-6 relative">
                <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full" />
                <svg
                  viewBox="0 0 200 200"
                  className="w-16 h-16 text-zinc-600 relative"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                >
                  <circle cx="100" cy="100" r="4" fill="currentColor" opacity="0.8" />
                  <circle cx="100" cy="60" r="3" fill="currentColor" opacity="0.6" />
                  <circle cx="130" cy="75" r="3" fill="currentColor" opacity="0.6" />
                  <circle cx="130" cy="125" r="3" fill="currentColor" opacity="0.6" />
                  <circle cx="100" cy="140" r="3" fill="currentColor" opacity="0.6" />
                  <circle cx="70" cy="125" r="3" fill="currentColor" opacity="0.6" />
                  <circle cx="70" cy="75" r="3" fill="currentColor" opacity="0.6" />
                  <line x1="100" y1="100" x2="100" y2="60" opacity="0.3" />
                  <line x1="100" y1="100" x2="130" y2="75" opacity="0.3" />
                  <line x1="100" y1="100" x2="130" y2="125" opacity="0.3" />
                  <line x1="100" y1="100" x2="100" y2="140" opacity="0.3" />
                  <line x1="100" y1="100" x2="70" y2="125" opacity="0.3" />
                  <line x1="100" y1="100" x2="70" y2="75" opacity="0.3" />
                </svg>
              </div>

              <div className="mb-2 text-center">
                <h1 className="text-3xl font-bold tracking-tight mb-3 text-zinc-100">
                  What do you want to search?
                </h1>
                <p className="text-sm text-zinc-400 max-w-md mx-auto">
                  Sai synthesizes answers from multiple sources with inline citations.
                </p>
              </div>

              <div className="relative w-full max-w-2xl mt-8">
                <div className="absolute inset-0 bg-blue-500/10 blur-3xl rounded-3xl" />
                <div className="relative">
                  <SearchBox
                    onSearch={handleSearch}
                    isLoading={false}
                    compact={false}
                    initialQuery={initialQuery}
                  />
                </div>
              </div>

              <div className="mt-6 text-center">
                <p className="text-xs text-zinc-500 mb-2">For example:</p>
                <ul className="text-sm text-zinc-400 space-y-1">
                  <li>• What are the best patterns for managing state in React?</li>
                  <li>• Latest threads on Hacker News about AI in healthcare.</li>
                  <li>• Compare Arch Linux vs Debian for a developer machine.</li>
                </ul>
              </div>
            </motion.div>
          )}

          {(appState === 'loading' ||
            appState === 'results' ||
            appState === 'refine' ||
            appState === 'error' ||
            appState === 'blocked') && (
            <motion.div
              key="active"
              initial={fromHistory ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full max-w-4xl space-y-6"
            >
              <SearchBox
                onSearch={handleSearch}
                isLoading={appState === 'loading'}
                compact={true}
                initialQuery={query}
              />

              {!fromHistory && (
                <ThinkingTrace
                  query={query}
                  currentPhase={stream.phase}
                  steps={stepLog}
                  sourceCount={stream.sources.length}
                  startedAt={startedAt}
                  completedAt={completedAt}
                  isLoading={appState === 'loading'}
                />
              )}

              {slowHint && appState === 'loading' && (
                <p className="text-xs text-zinc-500 animate-pulse">
                  This is taking longer than usual — still working on it…
                </p>
              )}

              {/* Refine prompt */}
              {appState === 'refine' && (
                <div className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-5 text-center">
                  <p className="text-sm font-medium text-zinc-300 mb-1">
                    Not enough quality sources
                  </p>
                  <p className="text-xs text-zinc-500 mb-4">
                    Sai found fewer than 2 reliable sources for this query. Try refining it with
                    more specifics.
                  </p>
                  {stream.suggestion && (
                    <p className="text-xs text-zinc-500 mb-2">
                      Suggested query:{' '}
                      <span className="italic text-zinc-300">&quot;{stream.suggestion}&quot;</span>
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 justify-center">
                    <button
                      onClick={handleNewSearch}
                      className="inline-flex items-center justify-center h-9 px-4 text-xs font-medium rounded-full bg-zinc-100 text-zinc-900 hover:bg-zinc-200 transition-colors"
                    >
                      Start a new search
                    </button>
                    {stream.suggestion && (
                      <button
                        onClick={handleRefineSuggestion}
                        className="inline-flex items-center justify-center h-9 px-4 text-xs font-medium rounded-full border border-zinc-600 text-zinc-300 hover:bg-zinc-800 transition-colors"
                      >
                        Try suggested query
                      </button>
                    )}
                  </div>
                  {stream.sources.length > 0 && (
                    <>
                      <p className="text-xs text-zinc-600 mt-3">
                        {stream.sources.length} lower-quality source
                        {stream.sources.length !== 1 ? 's' : ''} were still found.
                      </p>
                      <button
                        onClick={() => setShowLowerQualitySources((prev) => !prev)}
                        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 mt-1 mx-auto"
                      >
                        <span>{showLowerQualitySources ? 'Hide' : 'View'}</span>
                        {showLowerQualitySources ? (
                          <ChevronDown size={12} className="rotate-180" />
                        ) : (
                          <ChevronDown size={12} />
                        )}
                      </button>
                      {showLowerQualitySources && (
                        <div className="mt-3 grid gap-3 animate-in slide-in-from-top-2">
                          {stream.sources.map((source, idx) => (
                            <SourceCard
                              key={source.id}
                              id={source.id}
                              title={source.title}
                              url={source.url}
                              source={source.domain}
                              snippet={source.snippet}
                              confidence={source.confidence}
                              tier={source.tier}
                              publishedDate={source.publishedDate}
                              isOutdated={source.isOutdated}
                              provider={source.provider}
                              index={idx}
                              isLowerQuality={true}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {appState === 'blocked' && (
                <div className="w-full flex flex-col items-center pt-8 pb-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
                    <Clock size={20} className="text-zinc-400" />
                  </div>
                  <h2 className="text-lg font-semibold mb-2 text-zinc-100">Search limit reached</h2>
                  <p className="text-sm text-zinc-400 max-w-md mb-6">{errorMessage}</p>
                  <p className="text-xs text-zinc-600">
                    This resets automatically — no need to retry right now.
                  </p>
                </div>
              )}

              {appState === 'error' && (
                <div className="w-full flex flex-col items-center pt-8 pb-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                    <AlertCircle size={20} className="text-red-400" />
                  </div>
                  <h2 className="text-lg font-semibold mb-2 text-zinc-100">
                    {isOffline ? "You're offline" : 'Something went wrong'}
                  </h2>
                  <p className="text-sm text-zinc-400 max-w-md mb-6">{errorMessage}</p>
                  <button
                    onClick={handleNewSearch}
                    className="px-4 py-2 text-sm font-medium bg-zinc-100 text-zinc-900 rounded-xl hover:bg-zinc-200 transition-colors"
                  >
                    {isOffline ? 'Retry when back online' : 'Try Again'}
                  </button>
                </div>
              )}

              {appState === 'results' && synthesis && (
                <>
                  <div className="grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-start">
                    <div>
                      <SynthesisCard
                        text={synthesis.text || synthesis.content}
                        citations={citations}
                        sources={stream.sources}
                        conflictData={synthesis.conflictData}
                        sourceCount={synthesis.sourceCount}
                        queryType={synthesis.queryType}
                        onCiteClick={handleCiteClick}
                        isStreaming={isStreaming}
                        fromHistory={fromHistory}
                        onRetry={handleRetry}
                        onFeedback={handleFeedback}
                      />

                      {stream.followUps.length > 0 && (
                        <div className="mt-4 space-y-2">
                          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                            Related
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {stream.followUps.map((f) => (
                              <button
                                key={f}
                                onClick={() => handleFollowUp(f)}
                                className="group flex items-center gap-2 text-left text-sm text-zinc-300 bg-zinc-800/50 border border-zinc-700/50 hover:border-zinc-600 rounded-xl px-4 py-2.5 transition-colors"
                              >
                                <span className="flex-1">{f}</span>
                                <ArrowRight
                                  size={14}
                                  className="text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0"
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      {lastConfig.searchMode === 'table' ? (
                        <TableView sources={stream.sources} />
                      ) : (
                        <div className="space-y-3">
                          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider px-1">
                            Sources ({stream.sources.length})
                          </h3>
                          <div className="grid gap-3">
                            {stream.sources.map((source, i) => (
                              <SourceCard
                                key={source.id}
                                ref={(el) => {
                                  if (el) sourceRefs.current.set(source.id, el);
                                  else sourceRefs.current.delete(source.id);
                                }}
                                id={source.id}
                                title={source.title}
                                url={source.url}
                                source={source.domain}
                                snippet={source.snippet}
                                confidence={source.confidence}
                                tier={source.tier}
                                publishedDate={source.publishedDate}
                                isOutdated={source.isOutdated}
                                provider={source.provider}
                                index={i}
                                highlighted={highlightedSourceId === source.id}
                                onSelect={handleCiteClick}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {appState === 'loading' && (
                <div className="grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-start animate-pulse">
                  <div className="space-y-3">
                    <div className="bg-zinc-800/50 rounded-2xl h-40" />
                    <div className="bg-zinc-800/50 rounded-2xl h-40" />
                  </div>
                  <div className="space-y-3">
                    <div className="bg-zinc-800/50 rounded-xl h-24" />
                    <div className="bg-zinc-800/50 rounded-xl h-24" />
                    <div className="bg-zinc-800/50 rounded-xl h-24" />
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ApiKeysModal
        isOpen={showApiKeys}
        onClose={() => setShowApiKeys(false)}
        onKeysChange={notifyApiKeysChanged}
      />
    </SaiSearchLayout>
  );
}

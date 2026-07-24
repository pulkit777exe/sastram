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
import { SearchBox } from './SearchBox';
import type { SSEPhase } from './PhaseTracker';
import { SynthesisCard } from './SynthesisCard';
import { SourceCard } from './SourceCard';
import { TableView } from './TableView';
import { ApiKeysModal, getStoredApiKeys, hasAllApiKeys } from './ApiKeysModal';
import { Sidebar, type HistoryItem } from './Sidebar';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type {
  SearchConfig,
  Source,
  SynthesisResult,
  Citation,
} from '@/modules/ai-search/types';
import { StepLogEntry, ThinkingTrace } from './ThinkingTrace';

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
  const [hasKeys, setHasKeys] = useState(() =>
    typeof window !== 'undefined' ? hasAllApiKeys() : false
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  // Auto-collapse sidebar on small screens
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (mq.matches) setSidebarCollapsed(true);
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setSidebarCollapsed(true); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

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
    async (
      q: string,
      config: SearchConfig,
      context?: { query: string; followUp: string }
    ) => {
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
            retryAfter ? `Please wait ${retryAfter} seconds.` : 'Please wait a moment before searching again.'
          );
          setAppState('idle');
          return;
        }
        if (response.status === 503) {
          toasts.error('Service unavailable', 'AI features are temporarily over quota. Try again later.');
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
                // Each setTimeout pushes the update to its own macrotask so
                // React renders every phase instead of batching them all.
                const id = setTimeout(() => {
                  phaseTimerRef.current.delete(id);
                  setStream((prev) => ({
                    ...prev,
                    phase,
                    sources: sources ?? prev.sources,
                  }));
                  if (phase === 'reading') setMobileTab('sources');
                }, 0);
                phaseTimerRef.current.add(id);
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

  const sidebarProps = {
    onSelectSession: handleSelectSession,
    onNewSearch: handleNewSearch,
    collapsed: sidebarCollapsed,
    onOpenApiKeys: () => setShowApiKeys(true),
    hasApiKeys: hasKeys,
    currentSessionId,
    user,
  };

  return (
    <div className="flex gap-4 items-start">
      {/* Desktop: inline sidebar */}
      {!isMobile && <Sidebar {...sidebarProps} />}

      <div className="flex-1 min-w-0">
        <div className="mx-auto w-full max-w-4xl space-y-6 sm:space-y-8 px-4 md:px-6">
          <div className="flex items-center gap-2">
            {/* Desktop: collapse toggle */}
            {!isMobile && (
              <button
                onClick={() => setSidebarCollapsed((c) => !c)}
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!sidebarCollapsed}
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="flex items-center justify-center min-w-11 min-h-11 p-2 text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-xl border border-border transition-colors"
              >
                {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
             </button>
            )}

            {/* Mobile: drawer trigger — SheetContent portals out, so the
                trigger's parent container doesn't influence drawer positioning. */}
            {isMobile && (
              <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetTrigger asChild>
                  <button
                    className="flex items-center justify-center min-w-11 min-h-11 p-2 text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-xl border border-border transition-colors"
                    aria-label="Open sidebar"
                  >
                    <Menu size={16} />
                 </button>
               </SheetTrigger>
                <SheetContent side="left" className="w-64 p-0">
                  <SheetTitle className="sr-only">Search history</SheetTitle>
                  <Sidebar
                    {...sidebarProps}
                    collapsed={false}
                    onSelectSession={(item) => {
                      handleSelectSession(item);
                      setSheetOpen(false);
                    }}
                    onNewSearch={() => {
                      handleNewSearch();
                      setSheetOpen(false);
                    }}
                  />
               </SheetContent>
             </Sheet>
            )}

            <div className="flex-1" />
        {appState === 'results' || appState === 'refine' ? (
          <button
            onClick={handleNewSearch}
            className="hidden sm:inline-flex px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-xl border border-border transition-colors"
          >
            New Search
          </button>
        ) : null}
        <button
          onClick={() => setShowApiKeys(true)}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-xl border border-border transition-colors"
        >
          <KeyRound size={14} />
          <span className="hidden sm:inline">API Keys</span>
          {hasKeys && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {appState === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center pt-10 sm:pt-16 pb-8"
          >
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-bold tracking-tight mb-2">What do you want to search?</h2>
              <p className="text-sm text-muted-foreground">
                Sai synthesizes answers from multiple sources with inline citations.
              </p>
            </div>
            <SearchBox onSearch={handleSearch} isLoading={false} compact={false} initialQuery={initialQuery} />
          </motion.div>
        )}

        {(appState === 'loading' || appState === 'results' || appState === 'refine' || appState === 'error' || appState === 'blocked') && (
          <motion.div
            key="active"
            initial={fromHistory ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            <SearchBox onSearch={handleSearch} isLoading={appState === 'loading'} compact={true} initialQuery={query} />

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
              <p className="text-xs text-muted-foreground animate-pulse">
                This is taking longer than usual — still working on it…
              </p>
            )}

            {/* Refine prompt */}
            {appState === 'refine' && (
              <div className="w-full bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 text-center">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">
                  Not enough quality sources
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  Sai found fewer than 2 reliable sources for this query. Try refining it with more specifics.
                </p>
                {stream.suggestion && (
                  <p className="text-xs text-muted-foreground mb-2">
                    Suggested query: <span className="italic text-foreground">&quot;{stream.suggestion}&quot;</span>
                  </p>
                )}
                <div className="flex flex-wrap gap-2 justify-center">
                  <button
                    onClick={handleNewSearch}
                    className="inline-flex items-center justify-center h-9 px-4 text-xs font-medium rounded-full bg-foreground text-background hover:opacity-90 transition-opacity"
                  >
                    Start a new search
                  </button>
                  {stream.suggestion && (
                    <button
                      onClick={handleRefineSuggestion}
                      className="inline-flex items-center justify-center h-9 px-4 text-xs font-medium rounded-full border border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 transition-colors"
                    >
                      Try suggested query
                    </button>
                  )}
              </div>
              {stream.sources.length > 0 && (
                <>
                  <p className="text-[11px] text-muted-foreground/60 mt-3">
                    {stream.sources.length} lower-quality source{stream.sources.length !== 1 ? 's' : ''} were still found.
                  </p>
                  <button
                    onClick={() => setShowLowerQualitySources((prev) => !prev)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1"
                  >
                    <span>{showLowerQualitySources ? 'Hide' : 'View'}</span>
                    {showLowerQualitySources ? <ChevronDown size={12} className="rotate-180" /> : <ChevronDown size={12} />}
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
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Clock size={20} className="text-muted-foreground" />
                </div>
                <h2 className="text-lg font-semibold mb-2">Search limit reached</h2>
                <p className="text-sm text-muted-foreground max-w-md mb-6">{errorMessage}</p>
                <p className="text-xs text-muted-foreground/70">This resets automatically — no need to retry right now.</p>
              </div>
            )}

            {appState === 'error' && (
              <div className="w-full flex flex-col items-center pt-8 pb-4 text-center">
                <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                  <AlertCircle size={20} className="text-destructive" />
                </div>
                <h2 className="text-lg font-semibold mb-2">
                  {isOffline ? "You're offline" : 'Something went wrong'}
                </h2>
                <p className="text-sm text-muted-foreground max-w-md mb-6">{errorMessage}</p>
                <button
                  onClick={handleNewSearch}
                  className="px-4 py-2 text-sm font-medium bg-foreground text-background rounded-xl hover:opacity-90 transition-opacity"
                >
                  {isOffline ? 'Retry when back online' : 'Try Again'}
                </button>
              </div>
            )}

            {appState === 'results' && synthesis && (
              <>
                <div className="flex md:hidden gap-2 justify-center">
                  {(['answer', 'sources'] as MobileTab[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setMobileTab(tab)}
                      className={`px-4 py-1.5 text-xs rounded-full border transition-colors ${
                        mobileTab === tab
                          ? 'bg-foreground text-background border-foreground'
                            : 'bg-transparent text-muted-foreground border-border'
                      }`}
                    >
                      {tab === 'answer' ? 'Answer' : `Sources (${stream.sources.length})`}
                    </button>
                  ))}
                </div>

                <div className="grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-start">
                  <div className={mobileTab === 'answer' ? 'block' : 'hidden md:block'}>
                    <SynthesisCard
                      text={synthesis.text || synthesis.content}
                      citations={citations}
                      sources={stream.sources}
                      conflictData={synthesis.conflictData}
                      sourceCount={synthesis.sourceCount}
                      queryType={synthesis.queryType}
                      onCiteClick={handleCiteClick}
                      isStreaming={isStreaming}
                    />

                    {stream.followUps.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                          Related
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {stream.followUps.map((f) => (
                            <button
                              key={f}
                              onClick={() => handleFollowUp(f)}
                              className="group flex items-center gap-2 text-left text-sm text-foreground/90 bg-card border border-border hover:border-foreground/30 rounded-xl px-4 py-2.5 transition-colors"
                            >
                              <span className="flex-1">{f}</span>
                              <ArrowRight size={14} className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className={mobileTab === 'sources' ? 'block' : 'hidden md:block'}>
                    {lastConfig.searchMode === 'table' ? (
                      <TableView sources={stream.sources} />
                    ) : (
                      <div className="space-y-3">
                        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
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
                  <div className="bg-muted rounded-2xl h-40" />
                  <div className="bg-muted rounded-2xl h-40" />
               </div>
                <div className="space-y-3">
                  <div className="bg-muted rounded-xl h-24" />
                  <div className="bg-muted rounded-xl h-24" />
                  <div className="bg-muted rounded-xl h-24" />
               </div>
             </div>
            )}
         </motion.div>
        )}
       </AnimatePresence>
       </div>
     </div>

      <ApiKeysModal isOpen={showApiKeys} onClose={() => setShowApiKeys(false)} onKeysChange={setHasKeys} />
   </div>
  );
}

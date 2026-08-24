'use client';

import { useState, useCallback, useRef, useEffect, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { SearchBox } from '@/components/ai-search/SearchBox';
import { ApiKeysModal, getStoredApiKeys, hasAllApiKeys } from '@/components/ai-search/ApiKeysModal';
import { SaiSearchLayout, type HistoryItem } from '@/components/ai-search/sai-search-layout';
import { ChatMessageList } from '@/components/ai-search/ChatMessageList';
import { SearchInputBar } from '@/components/ai-search/SearchInputBar';
import { useSearchStream, DEFAULT_CONFIG, type ChatMessage, type AppState } from '@/components/ai-search/use-search-stream';
import type { SearchConfig } from '@/modules/ai-search/types';
import type { RetryStyle, FeedbackType } from '@/components/ai-search/StreamingText';

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
  const [currentStep, setCurrentStep] = useState(0);
  const [taskFailed, setTaskFailed] = useState(false);

  const [showApiKeys, setShowApiKeys] = useState(false);
  const hasKeys = useSyncExternalStore(subscribeToApiKeys, getHasApiKeys, () => false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessage | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { runSearch, handleNewSearch, handleSelectSession, abortSearch } = useSearchStream(
    { appState, query, lastConfig, errorMessage, isStreaming, slowHint, isOffline, currentSessionId, currentStep, taskFailed, messages, streamingMessage },
    { setAppState, setErrorMessage, setIsStreaming, setSlowHint, setIsOffline, setCurrentSessionId, setCurrentStep, setTaskFailed, setMessages, setStreamingMessage, setQuery, setLastConfig }
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  const handleSearch = useCallback(
    (q: string, config: SearchConfig) => {
      runSearch(q, config, currentSessionId);
    },
    [runSearch, currentSessionId]
  );

  const handleFollowUp = useCallback(
    (followUp: string) => {
      runSearch(followUp, lastConfig, currentSessionId);
    },
    [lastConfig, runSearch, currentSessionId]
  );

  const handleRetry = useCallback(
    (style: RetryStyle) => {
      if (!query) return;
      const styledQuery =
        style === 'same' ? query : `${query} (Please provide a ${style} response)`;
      runSearch(styledQuery, lastConfig, currentSessionId);
    },
    [query, lastConfig, runSearch, currentSessionId]
  );

  const handleFeedback = useCallback((_type: FeedbackType, _reason?: string) => {
    // Feedback handled via toast in StreamingText
  }, []);

  const isChatActive = messages.length > 0 || streamingMessage !== null;

  return (
    <SaiSearchLayout
      onSelectSession={handleSelectSession}
      onNewSearch={() => handleNewSearch(initialQuery)}
      currentSessionId={currentSessionId}
      hasApiKeys={hasKeys}
      onOpenApiKeys={() => setShowApiKeys(true)}
    >
      <div className="flex flex-col h-full">
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

        {isChatActive && (
          <div className="flex-1 flex flex-col min-h-0">
            <ChatMessageList
              messages={messages}
              streamingMessage={streamingMessage}
              appState={appState}
              currentStep={currentStep}
              taskFailed={taskFailed}
              slowHint={slowHint}
              errorMessage={errorMessage}
              isOffline={isOffline}
              onFollowUp={handleFollowUp}
              onRetry={handleRetry}
              onFeedback={handleFeedback}
              onNewSearch={() => handleNewSearch(initialQuery)}
              messagesEndRef={messagesEndRef}
            />

            <SearchInputBar
              query={query}
              onQueryChange={setQuery}
              onSubmit={() => {
                if (query.trim().length >= 3 && !isStreaming) {
                  runSearch(query, lastConfig, currentSessionId);
                }
              }}
              isStreaming={isStreaming}
              isChatActive={isChatActive}
              onNewSearch={() => handleNewSearch(initialQuery)}
            />
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

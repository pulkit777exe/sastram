'use client';

import { useSearch } from './search-provider';
import { SearchBox } from './SearchBox';
import { SearchInputBar } from './SearchInputBar';
import { ChatMessageList } from './ChatMessageList';
import { Button } from '@/components/ui/button';
import { DEFAULT_CONFIG } from './use-search-conversation';
import { useRef, useEffect } from 'react';
import type { SearchConfig } from '@/modules/ai-search/types';
import type { RetryStyle, FeedbackType } from './StreamingText';
import { SaiViewTransition } from '@/components/ui/view-transition';

const COMPOSER_VT_NAME_IDLE = 'ai-search-composer-idle';
const COMPOSER_VT_NAME_ACTIVE = 'ai-search-composer-active';

// ------------------------------------------------------------------
// Compound components — each accesses shared context, no prop drilling.
// architecture-compound-components + patterns-children-over-render-props
// ------------------------------------------------------------------

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col h-full">{children}</div>;
}

function IdleHeader() {
  return (
    <div className="mb-8 text-center">
      <h1 className="text-2xl tracking-tight text-ink mb-4 font-serif-heading">Search across Sastram</h1>
    </div>
  );
}

function Suggestions() {
  const {
    actions: { run },
  } = useSearch();
  return (
    <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-2 max-w-2xl w-full px-2">
      {[
        'What are the best patterns for managing state in React?',
        'Latest threads on Hacker News about AI in healthcare.',
        'Compare Arch Linux vs Debian for a developer machine.',
      ].map((q) => (
        <Button
          key={q}
          variant="outline"
          size="sm"
          className="w-full sm:w-auto max-w-full justify-center sm:justify-start text-center sm:text-left !whitespace-normal break-words text-wrap h-auto min-h-9 px-3.5 py-2 text-xs leading-snug text-ink-2 bg-surface border-line hover:border-line-strong hover:text-ink hover:bg-hover"
          onClick={() => run(q, DEFAULT_CONFIG)}
        >
          <span className="break-words whitespace-normal">{q}</span>
        </Button>
      ))}
    </div>
  );
}

function SearchField({ initialQuery }: { initialQuery: string }) {
  const {
    actions: { run },
  } = useSearch();
  function onSearch(q: string, cfg: SearchConfig) {
    run(q, cfg);
  }
  return (
    <SaiViewTransition name={COMPOSER_VT_NAME_IDLE}>
      <div className="relative w-full max-w-2xl mb-8">
        <SearchBox onSearch={onSearch} isLoading={false} compact={false} initialQuery={initialQuery} />
      </div>
    </SaiViewTransition>
  );
}

function InputBar({ onNewSearchInitial }: { onNewSearchInitial: string }) {
  const {
    state: { query, isStreaming, isChatActive, lastConfig },
    actions: { setQuery, run, newSearch },
  } = useSearch();
  return (
    <SaiViewTransition name={COMPOSER_VT_NAME_ACTIVE}>
      <SearchInputBar
        query={query}
        onQueryChange={setQuery}
        onSubmit={() => {
          if (query.trim().length >= 3 && !isStreaming) run(query, lastConfig);
        }}
        isStreaming={isStreaming}
        isChatActive={isChatActive}
        onNewSearch={() => newSearch(onNewSearchInitial)}
      />
    </SaiViewTransition>
  );
}

function MessageList() {
  const {
    state: { messages, streamingMessage, appState, currentStep, taskFailed, slowHint, errorMessage, isOffline },
    actions: { run, newSearch },
  } = useSearch();
  const {
    state: { query, lastConfig },
  } = useSearch();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  function handleFollowUp(followUp: string) {
    run(followUp, lastConfig);
  }
  function handleRetry(style: RetryStyle) {
    if (!query) return;
    const styled = style === 'same' ? query : `${query} (Please provide a ${style} response)`;
    run(styled, lastConfig);
  }
  function handleFeedback(_type: FeedbackType, _reason?: string) {}

  // Use derived isChatActive from context — not raw prop
  return (
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
      onNewSearch={() => newSearch(query)}
      messagesEndRef={messagesEndRef}
    />
  );
}

// Explicit variants — patterns-explicit-variants (no boolean modes)
function IdleVariant({ initialQuery }: { initialQuery: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-6 py-10">
      <div className="flex flex-col items-center">
        <IdleHeader />
        <SearchField initialQuery={initialQuery} />
        <Suggestions />
      </div>
    </div>
  );
}

function ActiveVariant({ onNewSearchInitial }: { onNewSearchInitial: string }) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <MessageList />
      <InputBar onNewSearchInitial={onNewSearchInitial} />
    </div>
  );
}

export const SearchComposer = {
  Frame,
  IdleHeader,
  SearchField,
  Suggestions,
  InputBar,
  MessageList,
  IdleVariant,
  ActiveVariant,
};

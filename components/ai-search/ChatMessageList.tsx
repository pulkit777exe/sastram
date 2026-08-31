'use client';

import { Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SynthesisCard } from '@/components/ai-search/SynthesisCard';
import { TaskSteps } from '@/components/ai-search/TaskSteps';
import type { ChatMessage, AppState } from '@/components/ai-search/use-search-stream';
import { SEARCH_PHASES } from '@/components/ai-search/use-search-stream';
import type { RetryStyle, FeedbackType } from '@/components/ai-search/StreamingText';
import type { Citation } from '@/modules/ai-search/types';
import { SaiViewTransition } from '@/components/ui/view-transition';

const FIRST_SYNTHESIS_VT_NAME = 'ai-search-first-synthesis';

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
            <Button
              key={f}
              variant="outline"
              size="sm"
              className="text-left text-sm text-ink bg-hover/50 border-line/50 hover:border-line-strong h-auto px-4 py-2.5"
              onClick={() => onFollowUp(f)}
            >
              <span className="flex-1">{f}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

interface ChatMessageListProps {
  messages: ChatMessage[];
  streamingMessage: ChatMessage | null;
  appState: AppState;
  currentStep: number;
  taskFailed: boolean;
  slowHint: boolean;
  errorMessage: string;
  isOffline: boolean;
  onFollowUp: (q: string) => void;
  onRetry: (style: RetryStyle) => void;
  onFeedback: (type: FeedbackType, reason?: string) => void;
  onNewSearch: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatMessageList({
  messages,
  streamingMessage,
  appState,
  currentStep,
  taskFailed,
  slowHint,
  errorMessage,
  isOffline,
  onFollowUp,
  onRetry,
  onFeedback,
  onNewSearch,
  messagesEndRef,
}: ChatMessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {messages.map((msg) => (
          <ChatMessageBubble
            key={msg.id}
            message={msg}
            onFollowUp={onFollowUp}
            onRetry={onRetry}
            onFeedback={onFeedback}
            isLatest={msg.id === messages[messages.length - 1]?.id}
          />
        ))}

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
              <SaiViewTransition name={FIRST_SYNTHESIS_VT_NAME} update="none">
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
              </SaiViewTransition>
            )}

            {!streamingMessage.text && (
              <div className="space-y-3">
                <div className="bg-hover/50 rounded-card h-32 animate-pulse" />
                <div className="bg-hover/50 rounded-card h-20 animate-pulse" />
              </div>
            )}
          </div>
        )}

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

        {appState === 'error' && (
          <div className="w-full flex flex-col items-center pt-8 pb-4 text-center">
            <div className="w-12 h-12 rounded-full bg-sai-red/10 flex items-center justify-center mb-4">
              <AlertCircle size={20} className="text-sai-red" />
            </div>
            <h2 className="text-lg font-semibold mb-2 text-ink">
              {isOffline ? "You're offline" : 'Something went wrong'}
            </h2>
            <p className="text-sm text-ink-2 max-w-md mb-6">{errorMessage}</p>
            <Button
              onClick={onNewSearch}
              className="px-4 py-2 text-sm font-medium"
            >
              {isOffline ? 'Retry when back online' : 'Try Again'}
            </Button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

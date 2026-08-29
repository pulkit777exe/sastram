'use client';

import { useCallback, useRef } from 'react';
import { drainToText, parseSSE, parseSSEError } from '@/lib/utils/sse';

export interface AIStreamToken {
  content: string;
}

export interface AIStreamDone {
  messageId: string;
  truncated: boolean;
}

export interface AIStreamError {
  error: string;
  messageId?: string;
}

export interface AIStreamStart {
  messageId: string;
  parentId: string;
  threadId: string;
  depth: number;
  createdAt: string;
  senderId: string;
  senderName: string | null;
  senderImage: string | null;
}

interface UseAIReplyStreamOptions {
  threadId: string;
  onStart?: (info: AIStreamStart) => void;
  onToken?: (token: string) => void;
  onDone?: (result: AIStreamDone) => void;
  onError?: (error: AIStreamError) => void;
  onMessageUpdate?: (messageId: string, content: string) => void;
}



export function useAIReplyStream({
  threadId,
  onStart,
  onToken,
  onDone,
  onError,
  onMessageUpdate,
}: UseAIReplyStreamOptions) {
  const abortRef = useRef<AbortController | null>(null);

  const startStream = useCallback((parentMessageId?: string) => {
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    const url = parentMessageId
      ? `/api/threads/${threadId}/ai-reply/stream?messageId=${encodeURIComponent(parentMessageId)}`
      : `/api/threads/${threadId}/ai-reply/stream`;

    fetch(url, { method: 'GET', signal: controller.signal })
      .then(async (response) => {
        const reader = response.body?.getReader();

        if (!response.ok) {
          if (reader) {
            const errorData = parseSSEError(await drainToText(reader));
            onError?.(errorData ?? { error: `HTTP ${response.status}` });
            reader.releaseLock();
          }
          return;
        }

        if (!reader) {
          onError?.({ error: 'No response body' });
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let messageId: string | undefined;
        let accumulated = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const { events, remaining } = parseSSE(buffer);
            buffer = remaining;

            for (const { event: currentEvent, data: raw } of events) {
              let data;
              try {
                data = JSON.parse(raw);
              } catch {
                continue;
              }

              switch (currentEvent) {
                case 'start':
                  messageId = data.messageId;
                  onStart?.(data as AIStreamStart);
                  break;
                case 'token':
                  onToken?.(data.content);
                  if (data.content) {
                    accumulated += data.content;
                    if (messageId) onMessageUpdate?.(messageId, accumulated);
                  }
                  break;
                case 'done':
                  onDone?.({ messageId: data.messageId, truncated: data.truncated });
                  return;
                case 'error':
                  onError?.({ error: data.error, messageId: data.messageId });
                  return;
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          onError?.({ error: err.message || 'Stream failed' });
        }
      });
  }, [threadId, onStart, onToken, onDone, onError, onMessageUpdate]);

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  return { startStream, stopStream };
}

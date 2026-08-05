'use client';

import { useCallback, useRef } from 'react';

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

    let buffer = '';
    let messageId: string | undefined;
    let accumulated = '';

    const url = parentMessageId
      ? `/api/threads/${threadId}/ai-reply/stream?messageId=${encodeURIComponent(parentMessageId)}`
      : `/api/threads/${threadId}/ai-reply/stream`;

    fetch(url, {
      method: 'GET',
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) {
        const reader = response.body?.getReader();
        if (reader) {
          const text = await readSSEBuffer(reader);
          const errorData = parseSSEError(text);
          onError?.(errorData ?? { error: `HTTP ${response.status}` });
          reader.releaseLock();
        }
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onError?.({ error: 'No response body' });
        return;
      }

      const decoder = new TextDecoder();

      // Persist across reads: an `event:` line and its `data:` line can arrive
      // in different network chunks.
      let currentEvent = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              const rawData = line.slice(6);
              try {
                const data = JSON.parse(rawData);

                switch (currentEvent) {
                  case 'start':
                    messageId = data.messageId;
                    onStart?.(data as AIStreamStart);
                    break;
                  case 'token':
                    onToken?.(data.content);
                    if (data.content) {
                      accumulated += data.content;
                      if (messageId) {
                        onMessageUpdate?.(messageId, accumulated);
                      }
                    }
                    break;
                  case 'done':
                    messageId = data.messageId;
                    onDone?.({ messageId: data.messageId, truncated: data.truncated });
                    return;
                  case 'error':
                    onError?.({ error: data.error, messageId: data.messageId });
                    return;
                }
              } catch {
                // Malformed JSON — skip
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    }).catch((err) => {
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

function parseSSEError(text: string): AIStreamError | null {
  const match = text.match(/event: error\ndata: (.+)/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

async function readSSEBuffer(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

/**
 * SSE — single owner for Server-Sent Events helpers.
 *
 * Server: sseChunk / sseEvent / createSSEStream / blockedStream
 * Client: parseSSE
 *
 * Production design: no styling — pure protocol.
 * Vercel free: uses Web Streams (no WebSocket), respects
 * request.signal abort and closes controllers exactly once.
 */

import { NextResponse } from 'next/server';

// Named regex constants for SSE error parsing — KISS: keep complex patterns at top with comments
// Matches `event: error` followed by `data: {...}` (ai-reply/stream error format)
const SSE_EVENT_ERROR_RE = /event:\s*error\s*\ndata:\s*(.+)/;
// Matches `data: {"phase":"blocked"|"error", ...}` (forum-search blocked/error format)
const SSE_DATA_PHASE_RE = /data:\s*(\{[^}]*"phase"\s*:\s*"(?:blocked|error)"[^}]*\})/;

export type SSEDataEvent = { data: string; event?: string };

// ------------------------------------------------------------------
// Server helpers
// ------------------------------------------------------------------

/**
 * `data:`-only chunk (forum-search style).
 */
export function sseChunk(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * `event:` + `data:` chunk (ai-reply/stream style).
 */
export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function sseHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    ...extra,
  };
}

/**
 * Convenience for quota/cap rejections that must remain an SSE stream
 * so the client parser does not have to branch on Content-Type.
 * Mirrors the existing `blockedStream` in forum-search (200 + event-stream).
 */
export function blockedStream(message: string): NextResponse {
  const body = sseChunk({ phase: 'blocked', message });
  return new NextResponse(body, { status: 200, headers: sseHeaders() });
}

/**
 * Shared SSE sender — extracted so forum-search and ai-reply/stream do not
 * inline 5+ `controller.enqueue(encoder.encode(...))` branches.
 * Usage: `const sendEvent = createSseSender(controller, encoder, closedRef); sendEvent('token', data)`
 */
export function createSseSender(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  closedRef: { closed: boolean }
): (event: string, data: unknown) => void {
  return (event: string, data: unknown) => {
    if (closedRef.closed) return;
    try {
      controller.enqueue(encoder.encode(sseEvent(event, data)));
    } catch {
      closedRef.closed = true;
    }
  };
}

export function createDataSender(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder
): (payload: unknown) => void {
  return (payload: unknown) => {
    controller.enqueue(encoder.encode(sseChunk(payload)));
  };
}

function safelyCloseController(controller: ReadableStreamDefaultController<Uint8Array> | null): void {
  if (controller === null) return;
  try {
    controller.close();
  } catch {
    /* already closed */
  }
}

/**
 * Thin wrapper around ReadableStream that binds `request.signal` to
 * controller.close() exactly once and strips the listener on close.
 */
export function createSSEStream(
  request: Request,
  start: (controller: ReadableStreamDefaultController<Uint8Array>, send: (event: SSEDataEvent) => void) => Promise<void>
): Response {
  const encoder = new TextEncoder();
  let activeController: ReadableStreamDefaultController<Uint8Array> | null = null;
  let isClosed = false;

  function closeOnce(): void {
    if (isClosed) return;
    isClosed = true;
    safelyCloseController(activeController);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      activeController = controller;

      const send = (sseEventData: SSEDataEvent) => {
        if (isClosed) return;
        let chunkText: string;
        if (sseEventData.event !== undefined && sseEventData.event.length > 0) {
          chunkText = sseEvent(sseEventData.event, JSON.parse(sseEventData.data));
        } else {
          chunkText = `data: ${sseEventData.data}\n\n`;
        }
        try {
          controller.enqueue(encoder.encode(chunkText));
        } catch {
          isClosed = true;
        }
      };

      const onAbort = () => {
        closeOnce();
      };
      request.signal.addEventListener('abort', onAbort, { once: true });

      try {
        await start(controller, send);
      } catch {
        closeOnce();
      } finally {
        request.signal.removeEventListener('abort', onAbort);
      }
    },
  });

  return new Response(stream, { status: 200, headers: sseHeaders() });
}

// ------------------------------------------------------------------
// Client helpers — single parser for both `data:`-only and
// `event:` + `data:` streams.
// ------------------------------------------------------------------

export interface ParsedSSE {
  event: string; // '' for data-only blocks, otherwise the last `event:` value
  data: string; // raw JSON string after `data:`
}

/**
 * Incremental SSE parser that handles:
 * - `data: {...}\n\n` (forum-search)
 * - `event: token\ndata: {...}\n\n` (ai-reply/stream)
 * - blocks split across network chunks (currentEvent persists)
 *
 * Accumulates `buffer` across reads and yields complete blocks.
 * Returns remaining buffer for the next read.
 */
export function parseSSE(
  buffer: string
): { events: ParsedSSE[]; remaining: string } {
  // Split on double-newline — the SSE block delimiter
  const sseBlocks = buffer.split('\n\n');
  const remainingBuffer = sseBlocks.pop() ?? '';
  const parsedEvents: ParsedSSE[] = [];

  for (const sseBlock of sseBlocks) {
    const blockLines = sseBlock.split('\n');
    let currentEventName = '';
    const collectedDataLines: string[] = [];

    for (const blockLine of blockLines) {
      if (blockLine.startsWith('event:')) {
        currentEventName = blockLine.slice(6).trim();
      } else if (blockLine.startsWith('data:')) {
        const rawData = blockLine.slice(5);
        collectedDataLines.push(rawData.trimStart());
      }
    }

    if (collectedDataLines.length === 0) continue;
    // SSE spec: multiple data: lines join with \n — we emit one per block
    const joinedData = collectedDataLines.join('\n');
    if (joinedData.length === 0) continue;
    parsedEvents.push({ event: currentEventName, data: joinedData });
  }

  return { events: parsedEvents, remaining: remainingBuffer };
}

/**
 * Drain a ReadableStream to text — for non-ok error bodies.
 */
export async function drainToText(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

export function parseSSEError(responseText: string): { error: string; messageId?: string } | null {
  // Quick includes() check before regex — avoids running complex pattern on unrelated text
  if (responseText.includes('event:') && responseText.includes('error')) {
    const eventErrorMatch = responseText.match(SSE_EVENT_ERROR_RE);
    if (eventErrorMatch !== null && eventErrorMatch[1] !== undefined) {
      try {
        return JSON.parse(eventErrorMatch[1].trim());
      } catch {
        return null;
      }
    }
  }
  // Fallback: check for blocked/error phase with includes() before regex
  if (responseText.includes('"phase"') && (responseText.includes('"blocked"') || responseText.includes('"error"'))) {
    const dataPhaseMatch = responseText.match(SSE_DATA_PHASE_RE);
    if (dataPhaseMatch !== null && dataPhaseMatch[1] !== undefined) {
      try {
        const parsedPayload = JSON.parse(dataPhaseMatch[1]);
        let errorMessage: string = 'error';
        if (typeof parsedPayload.message === 'string' && parsedPayload.message.length > 0) {
          errorMessage = parsedPayload.message;
        } else if (typeof parsedPayload.error === 'string' && parsedPayload.error.length > 0) {
          errorMessage = parsedPayload.error;
        }
        return { error: errorMessage, messageId: parsedPayload.messageId };
      } catch {
        return null;
      }
    }
  }
  return null;
}

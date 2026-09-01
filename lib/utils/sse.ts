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
 * Thin wrapper around ReadableStream that binds `request.signal` to
 * controller.close() exactly once and strips the listener on close.
 */
export function createSSEStream(
  request: Request,
  start: (controller: ReadableStreamDefaultController<Uint8Array>, send: (event: SSEDataEvent) => void) => Promise<void>
): Response {
  const encoder = new TextEncoder();
  let activeController: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      activeController = controller;
      const send = (evt: SSEDataEvent) => {
        if (closed) return;
        const chunk = evt.event ? sseEvent(evt.event, JSON.parse(evt.data)) : `data: ${evt.data}\n\n`;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const onAbort = () => {
        if (closed) return;
        closed = true;
        try {
          activeController?.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener('abort', onAbort, { once: true });

      try {
        // Provide an ergonomic sender for callers that already have JSON
        const _sendJson = (event: string | null, data: unknown) => {
          if (closed) return;
          const chunk = event ? sseEvent(event, data) : sseChunk(data);
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            closed = true;
          }
        };
        // Caller's start may use either raw `controller` or `sendJson`
        // We pass the raw controller via closure and expose sendJson as `send`
        // For backwards compat, also call with (controller, send) signature
        await start(controller, send);
      } catch {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      } finally {
        request.signal.removeEventListener('abort', onAbort);
      }
    },
  });

  // Fallback abort if stream never started
  request.signal.addEventListener(
    'abort',
    () => {
      if (closed) return;
      closed = true;
      try {
        activeController?.close();
      } catch {
        /* already closed */
      }
    },
    { once: true }
  );

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
  const parts = buffer.split('\n\n');
  const remaining = parts.pop() ?? '';
  const events: ParsedSSE[] = [];

  for (const block of parts) {
    const lines = block.split('\n');
    let currentEvent = '';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      } else if (line.startsWith('data: ')) {
        dataLines.push(line.slice(6));
      } else if (line === 'data:') {
        dataLines.push('');
      }
    }

    if (dataLines.length === 0) continue;
    // SSE spec: multiple data: lines join with \n — we emit one per block
    const data = dataLines.join('\n');
    if (!data) continue;
    events.push({ event: currentEvent, data });
  }

  return { events, remaining };
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

export function parseSSEError(text: string): { error: string; messageId?: string } | null {
  // Try event: error\ndata: {...}
  const m = text.match(/event:\s*error\s*\ndata:\s*(.+)/);
  if (m) {
    try {
      return JSON.parse(m[1].trim());
    } catch {
      return null;
    }
  }
  // Fallback: data: {"phase":"blocked"|"error", ...}
  const dm = text.match(/data:\s*(\{[^}]*"phase"\s*:\s*"(?:blocked|error)"[^}]*\})/);
  if (dm) {
    try {
      const j = JSON.parse(dm[1]);
      return { error: j.message ?? j.error ?? 'error', messageId: j.messageId };
    } catch {
      return null;
    }
  }
  return null;
}

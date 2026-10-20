import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { useAIReplyStream } from '@/hooks/useAIReplyStream';

const originalFetch = globalThis.fetch;

function sse(events: Array<{ event: string; data: unknown }>): Response {
  return new Response(
    events
      .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      .join(''),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  );
}

describe('useAIReplyStream terminal events', () => {
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub();
    globalThis.fetch = fetchStub as unknown as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it('forwards the persisted failure content from an error event', async () => {
    fetchStub.resolves(
      sse([
        {
          event: 'start',
          data: {
            messageId: 'ai-1',
            parentId: 'parent-1',
            threadId: 'thread-1',
            depth: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            senderId: 'ai-user',
            senderName: 'Sastram AI',
            senderImage: null,
          },
        },
        {
          event: 'error',
          data: {
            error: 'Generation failed',
            messageId: 'ai-1',
            content: 'Sai could not answer this time.',
          },
        },
      ])
    );

    const onError = sinon.spy();
    const { result } = renderHook(() =>
      useAIReplyStream({ threadId: 'thread-1', onError })
    );

    result.current.startStream('parent-1');

    await waitFor(() => expect(onError.calledOnce).to.equal(true));
    expect(onError.firstCall.args[0]).to.deep.include({
      error: 'Generation failed',
      messageId: 'ai-1',
      content: 'Sai could not answer this time.',
    });
  });

  it('reports an error when the stream closes without done or error', async () => {
    fetchStub.resolves(
      sse([
        {
          event: 'start',
          data: {
            messageId: 'ai-2',
            parentId: 'parent-2',
            threadId: 'thread-1',
            depth: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            senderId: 'ai-user',
            senderName: 'Sastram AI',
            senderImage: null,
          },
        },
      ])
    );

    const onError = sinon.spy();
    const { result } = renderHook(() =>
      useAIReplyStream({ threadId: 'thread-1', onError })
    );

    result.current.startStream('parent-2');

    await waitFor(() => expect(onError.calledOnce).to.equal(true));
    expect(onError.firstCall.args[0]).to.deep.include({
      error: 'Stream ended before completion',
      messageId: 'ai-2',
    });
  });
});

import { expect } from 'chai';
import { randomUUID } from 'node:crypto';
import {
  extractAiInlineQuery,
  queueAiInlineIfRequested,
} from '@/modules/messages/actions/ai-inline';
import type { MessageSideEffectsPort } from '@/modules/messages/ports/side-effects';

function makeSideEffectsStub() {
  const calls: { enqueueAiInline: unknown[] } = { enqueueAiInline: [] };
  const stub: MessageSideEffectsPort = {
    sendMentionEmail: async () => {},
    enqueueAiInline: async (args) => {
      calls.enqueueAiInline.push(args);
    },
    createBulkNotifications: async () => {},
    recordActivity: async () => {},
    revalidateThreadPage: () => {},
    revalidateDashboard: () => {},
  };
  return { stub, calls };
}

describe('@sai inline reply — client-streaming delivery', () => {
  describe('extractAiInlineQuery', () => {
    it('extracts the query after @sai', () => {
      expect(extractAiInlineQuery('@sai what is the plan?')).to.equal('what is the plan?');
    });

    it('is case-insensitive', () => {
      expect(extractAiInlineQuery('Hey @SAI summarize this thread')).to.equal(
        'summarize this thread'
      );
    });

    it('returns null when there is no query after @sai', () => {
      expect(extractAiInlineQuery('thanks @sai')).to.equal(null);
      expect(extractAiInlineQuery('@sai   ')).to.equal(null);
    });

    it('returns null when @sai is not mentioned', () => {
      expect(extractAiInlineQuery('regular message')).to.equal(null);
    });
  });

  describe('queueAiInlineIfRequested', () => {
    it('does nothing when the content has no @sai query', async () => {
      const { stub, calls } = makeSideEffectsStub();
      const result = await queueAiInlineIfRequested({
        content: 'a plain message',
        userId: randomUUID(),
        threadId: randomUUID(),
        messageId: randomUUID(),
        sideEffects: stub,
      });
      expect(result).to.deep.equal({
        aiInlineQueued: false,
        aiInlineLimited: false,
        aiInlineStreaming: false,
      });
      expect(calls.enqueueAiInline).to.have.length(0);
    });

    it('skips enqueue and reports streaming when clientStreams is set', async () => {
      const { stub, calls } = makeSideEffectsStub();
      const result = await queueAiInlineIfRequested({
        content: '@sai what changed?',
        userId: randomUUID(),
        threadId: randomUUID(),
        messageId: randomUUID(),
        sideEffects: stub,
        clientStreams: true,
        quotaCheck: async () => ({ allowed: true, used: 1 }),
        spendCapCheck: async () => ({ allowed: true, remaining: 4, used: 1 }),
      });

      if (result.aiInlineLimited) {
        // Quota/spend-cap denied in this environment — streaming must not be
        // reported and nothing may be enqueued.
        expect(result.aiInlineStreaming).to.equal(false);
        expect(result.aiInlineQueued).to.equal(false);
      } else {
        expect(result.aiInlineStreaming).to.equal(true);
        expect(result.aiInlineQueued).to.equal(false);
      }
      // Never enqueue a background job when the client streams — that would
      // double-generate the reply.
      expect(calls.enqueueAiInline).to.have.length(0);
    });

    it('enqueues the background job when clientStreams is not set', async () => {
      const { stub, calls } = makeSideEffectsStub();
      const result = await queueAiInlineIfRequested({
        content: '@sai what changed?',
        userId: randomUUID(),
        threadId: randomUUID(),
        messageId: randomUUID(),
        sideEffects: stub,
        quotaCheck: async () => ({ allowed: true, used: 1 }),
        spendCapCheck: async () => ({ allowed: true, remaining: 4, used: 1 }),
      });

      if (result.aiInlineLimited) {
        expect(calls.enqueueAiInline).to.have.length(0);
      } else {
        expect(result.aiInlineQueued).to.equal(true);
        expect(result.aiInlineStreaming).to.equal(false);
        expect(calls.enqueueAiInline).to.have.length(1);
      }
    });
  });
});

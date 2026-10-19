import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest, stubAuth, stubHeaders, restoreStubs } from '../helpers';
import { resetRateLimiters } from '@/lib/services/rate-limit';
import { AppError } from '@/lib/utils/errors';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import type { ThreadAccessContext } from '@/lib/thread-access';

type GuardModule = typeof import('@/lib/middleware/ai-guard-route');

const allowAllContext: ThreadAccessContext = {
  threadId: 'cklxy00000000000000000000',
  createdBy: null,
  visibility: 'PUBLIC',
};

function loadGuard(): GuardModule {
  return require('@/lib/middleware/ai-guard-route') as GuardModule;
}

describe('guardAiRoute response fidelity', () => {
  let stubs: sinon.SinonStub[] = [];

  beforeEach(() => {
    resetRateLimiters();
    stubs.push(stubHeaders());
    stubs.push(...stubAuth());
  });

  afterEach(() => {
    restoreStubs(...stubs);
    stubs = [];
    const guardRoute = loadGuard();
    guardRoute.setGuardDepsForTests(null);
  });

  it('JSON: missing thread stays 404 NOT_FOUND instead of being flattened to 403', async () => {
    const guardRoute = loadGuard();
    const checkGuards = sinon.stub().resolves({ ok: true });
    guardRoute.setGuardDepsForTests({
      checkGuards,
      checkAccess: async () => {
        throw new AppError('Thread not found', 'NOT_FOUND', 404);
      },
    });

    const result = await guardRoute.guardAiRoute(
      mockRequest('/api/ai/thread-summary', { method: 'POST' }),
      {
        path: AiCallPath.THREAD_SUMMARY,
        quota: { kind: 'analysis' },
        threadId: allowAllContext.threadId,
        rateLimitScope: 'guard-test',
        sse: false,
      }
    );

    expect(result.ok).to.equal(false);
    if (result.ok) return;
    expect(result.response.status).to.equal(404);
    const body = await result.response.json();
    expect(body.error?.code).to.equal('NOT_FOUND');
    // Access runs BEFORE quota/spend: a missing thread must not consume quota.
    sinon.assert.notCalled(checkGuards);
  });

  it('SSE: missing thread keeps the 404 status and the `event: error` payload shape', async () => {
    const guardRoute = loadGuard();
    const checkGuards = sinon.stub().resolves({ ok: true });
    guardRoute.setGuardDepsForTests({
      checkGuards,
      checkAccess: async () => {
        throw new AppError('Thread not found', 'NOT_FOUND', 404);
      },
    });

    const result = await guardRoute.guardAiRoute(
      mockRequest('/api/threads/cklxy00000000000000000000/ai-reply/stream'),
      {
        path: AiCallPath.AI_REPLY_STREAM,
        quota: null,
        threadId: allowAllContext.threadId,
        rateLimitScope: 'guard-test-sse',
        sse: true,
      }
    );

    expect(result.ok).to.equal(false);
    if (result.ok) return;
    expect(result.response.status).to.equal(404);
    expect(result.response.headers.get('Content-Type')).to.contain('text/event-stream');
    const text = await result.response.text();
    expect(text).to.contain('event: error');
    expect(text).to.contain('{"error":"Thread not found"}');
    sinon.assert.notCalled(checkGuards);
  });

  it('fails closed with 500 when the access phase throws a non-AppError', async () => {
    const guardRoute = loadGuard();
    guardRoute.setGuardDepsForTests({
      checkGuards: sinon.stub().resolves({ ok: true }),
      checkAccess: async () => {
        throw new Error('connection reset');
      },
    });

    const result = await guardRoute.guardAiRoute(
      mockRequest('/api/ai/thread-summary', { method: 'POST' }),
      {
        path: AiCallPath.THREAD_SUMMARY,
        quota: { kind: 'analysis' },
        threadId: allowAllContext.threadId,
        rateLimitScope: 'guard-test-500',
        sse: false,
      }
    );

    expect(result.ok).to.equal(false);
    if (result.ok) return;
    expect(result.response.status).to.equal(500);
    const body = await result.response.json();
    expect(body.error?.code).to.equal('INTERNAL_ERROR');
  });

  it('returns the resolved ThreadAccessContext on success', async () => {
    const guardRoute = loadGuard();
    guardRoute.setGuardDepsForTests({
      checkGuards: sinon.stub().resolves({ ok: true }),
      checkAccess: async () => allowAllContext,
    });

    const result = await guardRoute.guardAiRoute(
      mockRequest('/api/ai/thread-summary', { method: 'POST' }),
      {
        path: AiCallPath.THREAD_SUMMARY,
        quota: { kind: 'analysis' },
        threadId: allowAllContext.threadId,
        rateLimitScope: 'guard-test-context',
        sse: false,
      }
    );

    expect(result.ok).to.equal(true);
    if (!result.ok) return;
    expect(result.session.user.id).to.equal('test-user-id');
    expect(result.context).to.deep.equal(allowAllContext);
  });

  it('precheck rejection skips quota/spend entirely', async () => {
    const guardRoute = loadGuard();
    const checkGuards = sinon.stub().resolves({ ok: true });
    let precheckRanAfterAccess = false;
    guardRoute.setGuardDepsForTests({
      checkGuards,
      checkAccess: async () => {
        precheckRanAfterAccess = true;
        return allowAllContext;
      },
    });

    const result = await guardRoute.guardAiRoute(
      mockRequest('/api/ai/thread-summary', { method: 'POST' }),
      {
        path: AiCallPath.THREAD_SUMMARY,
        quota: { kind: 'analysis' },
        threadId: allowAllContext.threadId,
        rateLimitScope: 'guard-test-precheck',
        sse: false,
        precheck: async () => {
          expect(precheckRanAfterAccess).to.equal(true);
          return new AppError('Thread needs at least 20 messages before a summary can be generated.', 'VALIDATION_ERROR', 400);
        },
      }
    );

    expect(result.ok).to.equal(false);
    if (result.ok) return;
    expect(result.response.status).to.equal(400);
    const body = await result.response.json();
    expect(body.error?.code).to.equal('VALIDATION_ERROR');
    sinon.assert.notCalled(checkGuards);
  });

  it('precheck returning null continues to quota/spend', async () => {
    const guardRoute = loadGuard();
    const checkGuards = sinon.stub().resolves({ ok: true });
    guardRoute.setGuardDepsForTests({
      checkGuards,
      checkAccess: async () => allowAllContext,
    });

    const result = await guardRoute.guardAiRoute(
      mockRequest('/api/ai/thread-summary', { method: 'POST' }),
      {
        path: AiCallPath.THREAD_SUMMARY,
        quota: { kind: 'analysis' },
        threadId: allowAllContext.threadId,
        rateLimitScope: 'guard-test-precheck-ok',
        sse: false,
        precheck: async () => null,
      }
    );

    expect(result.ok).to.equal(true);
    sinon.assert.calledOnce(checkGuards);
  });
});

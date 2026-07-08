import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest, stubAuth, stubHeaders, restoreStubs } from '../helpers';
import { prisma } from '@/lib/infrastructure/prisma';
import { resetRateLimiters } from '@/lib/services/rate-limit';

const quotaModulePath = require.resolve('@/lib/services/ai-analysis-quota');
const spendCapModulePath = require.resolve('@/lib/services/ai-spend-cap');
const POST = () => require('@/app/api/ai/resolution-score/route').POST;

describe('POST /api/ai/resolution-score', () => {
  let stubs: sinon.SinonStub[] = [];

  beforeEach(() => {
    resetRateLimiters();
    stubs.push(stubHeaders());
    stubs.push(...stubAuth());

    require.cache[quotaModulePath] = {
      id: quotaModulePath, filename: quotaModulePath, loaded: true, exports: {
        consumeAiAnalysisQuota: async () => ({ allowed: true, remaining: 29 }),
      },
    } as NodeModule;
    require.cache[spendCapModulePath] = {
      id: spendCapModulePath, filename: spendCapModulePath, loaded: true, exports: {
        checkAiSpendCap: async () => ({ allowed: true }),
      },
    } as NodeModule;
  });

  afterEach(() => {
    restoreStubs(...stubs);
    stubs = [];
    delete require.cache[quotaModulePath];
    delete require.cache[spendCapModulePath];
  });

  it('returns 401 when unauthenticated', async () => {
    restoreStubs(...stubs);
    stubs = [];
    stubs.push(stubHeaders());
    stubs.push(...stubAuth(null));

    const res = await POST()(mockRequest('/api/ai/resolution-score', {
      method: 'POST',
      body: { threadId: 'thread-1' },
    }));
    const body = await res.json();

    expect(res.status).to.equal(401);
    expect(body.error?.code).to.equal('AUTH_REQUIRED');
  });

  it('returns 403 when not a member', async () => {
    stubs.push(sinon.stub(prisma.threadMember, 'findUnique').resolves(null));

    const res = await POST()(mockRequest('/api/ai/resolution-score', {
      method: 'POST',
      body: { threadId: 'thread-1' },
    }));
    const body = await res.json();

    expect(res.status).to.equal(403);
    expect(body.error?.code).to.equal('FORBIDDEN');
  });
});

import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import type { NextRequest } from 'next/server';
import { mockRequest } from '../helpers';
import { resetEnvCache } from '@/lib/config/env';

const routeModulePath = require.resolve('@/app/api/cron/promote-knowledge/route');
const promotionModulePath = require.resolve('@/lib/services/knowledge-promotion');
const cronAuthModulePath = require.resolve('@/lib/middleware/cron-auth');
const loggerModulePath = require.resolve('@/lib/infrastructure/logger');

type RouteModule = { GET: (req: NextRequest) => Promise<Response> };

function stubModule(path: string, exports: Record<string, unknown>) {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  } as NodeModule;
}

function loadRoute(options: { promotion: sinon.SinonStub; stubAuth?: boolean }): {
  GET: (req: NextRequest) => Promise<Response>;
} {
  stubModule(promotionModulePath, { promoteThreadsToKnowledgePages: options.promotion });

  if (options.stubAuth === false) {
    // Let the route load the real verifyCronAuth for auth coverage.
    delete require.cache[cronAuthModulePath];
  } else {
    stubModule(cronAuthModulePath, { verifyCronAuth: () => null });
  }

  stubModule(loggerModulePath, {
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
    },
  });

  delete require.cache[routeModulePath];
  const route = require(routeModulePath) as RouteModule;
  return { GET: route.GET };
}

describe('GET /api/cron/promote-knowledge', () => {
  const originalEnv = process.env.CRON_SECRET;

  afterEach(() => {
    delete require.cache[routeModulePath];
    delete require.cache[promotionModulePath];
    delete require.cache[cronAuthModulePath];
    delete require.cache[loggerModulePath];

    if (originalEnv === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalEnv;
    }
    resetEnvCache();
  });

  it('returns 401 when CRON_SECRET is set but auth header is missing', async () => {
    process.env.CRON_SECRET = 'test-secret-that-is-at-least-32-chars-long';
    resetEnvCache();

    const promotion = sinon.stub().resolves({});
    const { GET } = loadRoute({ promotion, stubAuth: false });
    const res = await GET(mockRequest('/api/cron/promote-knowledge'));
    const body = await res.json();

    expect(res.status).to.equal(401);
    expect(body.error).to.equal('Unauthorized');
    sinon.assert.notCalled(promotion);
  });

  it('returns 401 when auth header has wrong secret', async () => {
    process.env.CRON_SECRET = 'test-secret-that-is-at-least-32-chars-long';
    resetEnvCache();

    const promotion = sinon.stub().resolves({});
    const { GET } = loadRoute({ promotion, stubAuth: false });
    const res = await GET(
      mockRequest('/api/cron/promote-knowledge', {
        headers: { Authorization: 'Bearer wrong-secret' },
      })
    );
    const body = await res.json();

    expect(res.status).to.equal(401);
    expect(body.error).to.equal('Unauthorized');
    sinon.assert.notCalled(promotion);
  });

  it('promotes once and returns the service result on the happy path', async () => {
    const promotionResult = {
      candidates: 3,
      created: 1,
      updated: 1,
      unchanged: 1,
      demoted: 2,
      skipped: 0,
    };
    const promotion = sinon.stub().resolves(promotionResult);
    const { GET } = loadRoute({ promotion });

    const res = await GET(mockRequest('/api/cron/promote-knowledge'));
    const body = await res.json();

    expect(res.status).to.equal(200);
    expect(body.success).to.equal(true);
    expect(body.data).to.deep.equal(promotionResult);
    sinon.assert.calledOnce(promotion);
  });
});

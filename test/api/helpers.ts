import { NextRequest } from 'next/server';
import sinon from 'sinon';
import { logger } from '@/lib/infrastructure/logger';

const nextHeaders = require('next/headers');

export type MockRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export function mockRequest(url: string, options: MockRequestOptions = {}): NextRequest {
  const { method = 'GET', body, headers = {}, signal } = options;

  const allHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (body !== undefined && method !== 'GET') {
    return new NextRequest(new URL(url, 'http://localhost:3000'), {
      method,
      headers: allHeaders,
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  }

  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    headers: allHeaders,
    ...(signal ? { signal } : {}),
  });
}

const defaultUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  image: null,
  role: 'USER',
  status: 'ACTIVE',
};

export function createMockSession(user: Partial<typeof defaultUser> = {}): { user: typeof defaultUser } {
  return { user: { ...defaultUser, ...user } };
}

/**
 * Stubs authentication for tests.
 *
 * Strategy: replace session + barrel module exports, then delete ALL
 * non-node_modules modules EXCEPT infrastructure singletons that tests
 * stub with sinon (prisma, redis, logger, rate-limit) and modules with
 * side effects that re-validate on load (env, auth config).
 *
 * This forces source modules (route handlers, middleware, etc.) to re-load
 * and pick up the replaced session/barrel exports from the cached modules.
 */
export function stubAuth(session: { user: Record<string, unknown> } | null = createMockSession()): sinon.SinonStub[] {
  const stubs: sinon.SinonStub[] = [];

  const mockPayload = session === null
    ? null
    : {
        user: {
          id: session.user.id as string,
          email: session.user.email as string,
          name: (session.user.name as string) ?? null,
          image: (session.user.image as string) ?? null,
          role: ((session.user.role as string) ?? 'USER') as never,
          status: ((session.user.status as string) ?? 'ACTIVE') as never,
        },
      };

  const mockRequireSessionOrThrow = async (_checkBanStatus?: boolean) => {
    if (!mockPayload) {
      const { AppError } = await import('@/lib/utils/errors');
      throw new AppError('Unauthorized: no session', 'AUTH_REQUIRED', 401);
    }
    return mockPayload;
  };

  const mockRequireSession = async (_checkBanStatus?: boolean) => {
    if (!mockPayload) {
      const { redirect } = await import('next/navigation');
      redirect('/login');
    }
    return mockPayload;
  };

  const mockGetSession = async () => mockPayload;

  // ── Session module ──
  const sessionModulePath = require.resolve('@/modules/auth/session');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(sessionModulePath);
  const sessionModule = require.cache[sessionModulePath];

  if (sessionModule) {
    const originalSessionExports = sessionModule.exports;
    sessionModule.exports = {
      ...originalSessionExports,
      getSession: mockGetSession,
      requireSession: mockRequireSession,
      requireSessionOrThrow: mockRequireSessionOrThrow,
    } as typeof originalSessionExports;

    // ── Barrel module ──
    const barrelPath = require.resolve('@/modules/auth');

    // Delete ALL non-node_modules modules EXCEPT:
    // - session module (which we just replaced)
    // - infrastructure singletons that tests stub with sinon
    // - env/auth config modules that fail on re-validation
    // - error utils (needed for instanceof AppError)
    const preserve = new Set<string>();
    for (const key of Object.keys(require.cache)) {
      if (key.includes('node_modules')) {
        preserve.add(key);
        continue;
      }
      if (key === sessionModulePath) {
        preserve.add(key);
        continue;
      }
      // Preserve infrastructure singletons, config, and error modules
      if (
        key.includes('prisma') ||
        key.includes('redis') ||
        key.includes('logger') ||
        key.includes('rate-limit') ||
        key.includes('env.ts') ||
        key.includes('services/auth') ||
        key.includes('errors.ts') ||
        key.includes('permissions')
      ) {
        preserve.add(key);
      }
    }
    for (const key of Object.keys(require.cache)) {
      if (preserve.has(key)) continue;
      delete require.cache[key];
    }

    // Register cleanup to restore original module exports.
    stubs.push({
      restore: () => {
        sessionModule.exports = originalSessionExports;
        // Re-clear non-preserved modules so next test starts clean
        for (const key of Object.keys(require.cache)) {
          if (preserve.has(key)) continue;
          delete require.cache[key];
        }
      },
    } as unknown as sinon.SinonStub);
  }

  return stubs;
}

export function stubHeaders(): sinon.SinonStub {
  return sinon.stub(nextHeaders, 'headers').resolves(new Headers());
}

export function stubLogger() {
  return {
    error: sinon.stub(logger, 'error'),
    warn: sinon.stub(logger, 'warn'),
    info: sinon.stub(logger, 'info'),
    debug: sinon.stub(logger, 'debug'),
  };
}

export function restoreStubs(...stubs: sinon.SinonStub[]) {
  for (const stub of stubs) {
    try { stub.restore(); } catch {}
  }
}

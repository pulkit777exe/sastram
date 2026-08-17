import { NextRequest } from 'next/server';
import sinon from 'sinon';
import { auth } from '@/lib/services/auth';
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
 * Prisma 7 model delegates use JavaScript Proxy objects — sinon.stub() silently
 * fails because the Proxy's set trap ignores the assignment. Instead of stubbing
 * prisma.user.findUnique, we replace the session module's functions in the
 * require cache so they return mock sessions directly, bypassing Prisma entirely.
 *
 * Route handlers are lazy-loaded via require() in tests, so they pick up the
 * replaced session module from the cache.
 */
export function stubAuth(session: { user: Record<string, unknown> } | null = createMockSession()): sinon.SinonStub[] {
  const stubs: sinon.SinonStub[] = [];

  if (session === null) {
    stubs.push(sinon.stub(auth.api, 'getSession').resolves(null));
  } else {
    const value = {
      session: { id: 's1', createdAt: new Date(), updatedAt: new Date(), userId: session.user.id as string, expiresAt: new Date(Date.now() + 86400000), token: 't1' },
      user: { ...session.user, createdAt: new Date(), updatedAt: new Date(), emailVerified: true },
    };
    stubs.push(sinon.stub(auth.api, 'getSession').resolves(value as Awaited<ReturnType<typeof auth.api.getSession>>));

    // Replace session module in require cache to bypass Prisma entirely.
    const sessionModulePath = require.resolve('@/modules/auth/session');
    const originalModule = require.cache[sessionModulePath];

    if (originalModule) {
      const originalExports = originalModule.exports;
      const mockPayload = {
        user: {
          id: session.user.id as string,
          email: session.user.email as string,
          name: (session.user.name as string) ?? null,
          image: (session.user.image as string) ?? null,
          role: ((session.user.role as string) ?? 'USER') as never,
          status: ((session.user.status as string) ?? 'ACTIVE') as never,
        },
      };

      originalModule.exports = {
        ...originalExports,
        getSession: async () => mockPayload,
        requireSession: async (_checkBanStatus?: boolean) => mockPayload,
        requireSessionOrThrow: async (_checkBanStatus?: boolean) => mockPayload,
      };

      // Also delete dependent modules from cache so they reload with the new session module.
      const dependentModulePaths = Object.keys(require.cache).filter((key) => {
        try {
          const mod = require.cache[key];
          if (!mod?.exports) return false;
          const exports = mod.exports;
          // Check if this module imports from the session module
          return (
            typeof exports.requireSession === 'function' ||
            typeof exports.requireSessionOrThrow === 'function'
          );
        } catch {
          return false;
        }
      });

      // Register cleanup to restore original module
      stubs.push({
        restore: () => {
          originalModule.exports = originalExports;
          // Restore any dependent modules that were loaded with the mock
          for (const depPath of dependentModulePaths) {
            delete require.cache[depPath];
          }
        },
      } as unknown as sinon.SinonStub);
    }
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

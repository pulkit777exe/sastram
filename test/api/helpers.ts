import { NextRequest } from 'next/server';
import sinon from 'sinon';
import { auth } from '@/lib/services/auth';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';

export type MockRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
};

export function mockRequest(url: string, options: MockRequestOptions = {}): NextRequest {
  const { method = 'GET', body, headers = {} } = options;

  const allHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  const init: RequestInit = {
    method,
    headers: allHeaders,
  };

  if (body !== undefined && method !== 'GET') {
    init.body = JSON.stringify(body);
  }

  return new NextRequest(new URL(url, 'http://localhost:3000'), init as any);
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

export function stubAuth(session: { user: Record<string, unknown> } | null = createMockSession()): sinon.SinonStub {
  const value = session
    ? {
        session: { id: 's1', createdAt: new Date(), updatedAt: new Date(), userId: session.user.id, expiresAt: new Date(Date.now() + 86400000), token: 't1' },
        user: { ...session.user, createdAt: new Date(), updatedAt: new Date(), emailVerified: true },
      }
    : null;
  return sinon.stub(auth.api, 'getSession').resolves(value as any);
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

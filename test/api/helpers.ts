import { NextRequest } from 'next/server';
import sinon from 'sinon';
import { auth } from '@/lib/services/auth';
import { logger } from '@/lib/infrastructure/logger';

const nextHeaders = require('next/headers');
const { prisma } = require('@/lib/infrastructure/prisma');

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
    stubs.push(sinon.stub(prisma.user, 'findUnique').resolves({
      id: session.user.id as string,
      email: session.user.email as string,
      name: (session.user.name as string) ?? null,
      image: (session.user.image as string) ?? null,
      role: ((session.user.role as string) ?? 'USER') as never,
      status: ((session.user.status as string) ?? 'ACTIVE') as never,
    } as never));
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

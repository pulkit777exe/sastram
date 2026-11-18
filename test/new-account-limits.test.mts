import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { prisma } from '@/lib/infrastructure/prisma';
import {
  enforceNewAccountWriteLimit,
  NEW_ACCOUNT_MESSAGE_LIMIT,
  NEW_ACCOUNT_THREAD_LIMIT,
  NEW_ACCOUNT_WRITE_WINDOW_MINUTES,
} from '@/lib/services/new-account-limits';

describe('new-account write limits', () => {
  let clock: sinon.SinonFakeTimers;
  let findUniqueStub: sinon.SinonStub;
  let threadCountStub: sinon.SinonStub;
  let messageCountStub: sinon.SinonStub;

  beforeEach(() => {
    clock = sinon.useFakeTimers(new Date('2026-11-15T12:00:00.000Z').getTime());
    findUniqueStub = sinon.stub();
    threadCountStub = sinon.stub();
    messageCountStub = sinon.stub();
    (prisma as any).user = { ...(prisma as any).user, findUnique: findUniqueStub };
    (prisma as any).thread = { ...(prisma as any).thread, count: threadCountStub };
    (prisma as any).message = { ...(prisma as any).message, count: messageCountStub };
  });

  afterEach(() => {
    clock.restore();
    sinon.restore();
  });

  it('allows privileged roles without DB checks', async () => {
    const result = await enforceNewAccountWriteLimit({ userId: 'u1', role: 'ADMIN', action: 'thread' });
    expect(result.ok).to.equal(true);
    expect(findUniqueStub.called).to.equal(false);
  });

  it('allows established accounts', async () => {
    findUniqueStub.resolves({ createdAt: new Date(Date.now() - (NEW_ACCOUNT_WRITE_WINDOW_MINUTES + 5) * 60_000) });
    const result = await enforceNewAccountWriteLimit({ userId: 'u1', role: 'USER', action: 'thread' });
    expect(result.ok).to.equal(true);
    expect(threadCountStub.called).to.equal(false);
  });

  it('rate limits new-account thread creation after threshold', async () => {
    findUniqueStub.resolves({ createdAt: new Date(Date.now() - 5 * 60_000) });
    threadCountStub.resolves(NEW_ACCOUNT_THREAD_LIMIT);
    const result = await enforceNewAccountWriteLimit({ userId: 'u1', role: 'USER', action: 'thread' });
    expect(result.ok).to.equal(false);
    if (!result.ok) expect(result.code).to.equal('RATE_LIMITED');
  });

  it('rate limits new-account message posting after threshold', async () => {
    findUniqueStub.resolves({ createdAt: new Date(Date.now() - 5 * 60_000) });
    messageCountStub.resolves(NEW_ACCOUNT_MESSAGE_LIMIT);
    const result = await enforceNewAccountWriteLimit({ userId: 'u1', role: 'USER', action: 'message' });
    expect(result.ok).to.equal(false);
    if (!result.ok) expect(result.code).to.equal('RATE_LIMITED');
  });

  it('fails closed when account-age checks are unavailable', async () => {
    findUniqueStub.rejects(new Error('db down'));
    const result = await enforceNewAccountWriteLimit({ userId: 'u1', role: 'USER', action: 'thread' });
    expect(result.ok).to.equal(false);
    if (!result.ok) expect(result.code).to.equal('RATE_LIMITED');
  });
});

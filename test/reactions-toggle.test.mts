import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { stubAuth } from '@/test/api/helpers';
import { prisma } from '@/lib/infrastructure/prisma';
import { createFakeReactionStore } from '@/modules/reactions/adapters/reaction-store';
import { createFakeReactionSideEffects } from '@/modules/reactions/adapters/fake-side-effects';

const nextHeaders = require('next/headers');
// Lazy require: stubAuth() swaps session exports in beforeEach, so the
// action module must load after the swap (static import would capture
// the real requireSession binding at file-load time).
const toggleReactionCore = (...args: Parameters<typeof import('@/modules/reactions/actions').toggleReactionCore>) =>
  (require('@/modules/reactions/actions').toggleReactionCore as typeof import('@/modules/reactions/actions').toggleReactionCore)(...args);

describe('toggleReactionCore (DB-free via ReactionStore fake)', () => {
  let sessionStubs: sinon.SinonStub[];
  let headersStub: sinon.SinonStub;
  let origThreadFindUnique: typeof prisma.thread.findUnique;

  const store = () => createFakeReactionStore({ messageThreads: { 'msg-1': 'thread-1' } });
  const effects = () => createFakeReactionSideEffects();

  beforeEach(() => {
    sessionStubs = stubAuth();
    headersStub = sinon.stub(nextHeaders, 'headers').resolves(new Headers());
    origThreadFindUnique = prisma.thread.findUnique;
    (prisma.thread as unknown as Record<string, unknown>).findUnique = (async () => ({
      id: 'thread-1',
      createdBy: 'someone-else',
      visibility: 'PUBLIC',
    })) as unknown as typeof prisma.thread.findUnique;
  });

  afterEach(() => {
    sessionStubs.forEach((s) => s.restore());
    headersStub.restore();
    (prisma.thread as unknown as Record<string, unknown>).findUnique = origThreadFindUnique;
  });

  it('toggles on then off with reconciled counts', async () => {
    const deps = { store: store(), sideEffects: effects() };
    const on = await toggleReactionCore({ messageId: 'msg-1', emoji: '👍' }, deps);
    expect(on.error).to.be.null;
    expect(on.data).to.deep.equal({ hasReacted: true, likeCount: 1 });

    const off = await toggleReactionCore({ messageId: 'msg-1', emoji: '👍' }, deps);
    expect(off.error).to.be.null;
    expect(off.data).to.deep.equal({ hasReacted: false, likeCount: 0 });
  });

  it('returns NOT_FOUND for an unknown message', async () => {
    const res = await toggleReactionCore({ messageId: 'missing', emoji: '👍' }, { store: store(), sideEffects: effects() });
    expect(res.errorCode).to.equal('NOT_FOUND');
  });
});

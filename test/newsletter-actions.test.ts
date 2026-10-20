import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { stubAuth } from '@/test/api/helpers';
import { installFakePrisma } from '@/test/support/fake-prisma';

const nextHeaders = require('next/headers');
const nextCache = require('next/cache');

const THREAD_ID = 'cklxy00000000000000000000';
const subscribeToThreadAction = () =>
  require('@/modules/newsletter/actions').subscribeToThreadAction as (
    args: { threadId: string; slug: string }
  ) => Promise<{ ok: boolean; errorCode: string | null }>;

describe('subscribeToThreadAction authorization', () => {
  let sessionStubs: sinon.SinonStub[];
  let headersStub: sinon.SinonStub;
  let revalidateStub: sinon.SinonStub;
  let restorePrisma: (() => void) | null = null;
  let upsertCalls: number;

  beforeEach(() => {
    sessionStubs = stubAuth();
    headersStub = sinon.stub(nextHeaders, 'headers').resolves(new Headers());
    revalidateStub = sinon.stub(nextCache, 'revalidatePath').resolves();
    upsertCalls = 0;
  });

  afterEach(() => {
    sessionStubs.forEach((stub) => stub.restore());
    headersStub.restore();
    revalidateStub.restore();
    restorePrisma?.();
  });

  function installThread(visibility: 'PUBLIC' | 'PRIVATE') {
    restorePrisma = installFakePrisma({
      'thread.findUnique': async () => ({
        id: THREAD_ID,
        createdBy: 'another-user',
        visibility,
      }),
      'threadInvitation.findFirst': async () => null,
      'user.findUnique': async () => ({
        email: 'test@example.com',
        role: 'USER',
      }),
      'threadSubscription.upsert': async () => {
        upsertCalls += 1;
        return { id: 'subscription-id' };
      },
    });
  }

  it('rejects a subscription to a private thread the user cannot read', async () => {
    installThread('PRIVATE');

    const result = await subscribeToThreadAction()({ threadId: THREAD_ID, slug: 'private-thread' });

    expect(result.ok).to.equal(false);
    expect(result.errorCode).to.equal('FORBIDDEN');
    expect(upsertCalls).to.equal(0);
  });

  it('allows a subscription to a public thread', async () => {
    installThread('PUBLIC');

    const result = await subscribeToThreadAction()({ threadId: THREAD_ID, slug: 'public-thread' });

    expect(result.ok).to.equal(true);
    expect(result.errorCode).to.equal(null);
    expect(upsertCalls).to.equal(1);
  });
});

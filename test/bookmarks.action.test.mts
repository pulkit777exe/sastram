import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { stubAuth } from '@/test/api/helpers';
import { installFakePrisma } from '@/test/support/fake-prisma';

const nextHeaders = require('next/headers');
const getBookmarkedThreads = () => require('@/modules/bookmarks/actions').getBookmarkedThreads;

describe('Bookmarks action: getBookmarkedThreads input contract', () => {
  let sessionStubs: sinon.SinonStub[];
  let headersStub: sinon.SinonStub;
  let restorePrisma: () => void;

  beforeEach(() => {
    sessionStubs = stubAuth();
    headersStub = sinon.stub(nextHeaders, 'headers').resolves(new Headers());
    restorePrisma = installFakePrisma({
      'userBookmark.findMany': async () => [],
      'userBookmark.count': async () => 0,
    });
  });

  afterEach(() => {
    sessionStubs.forEach((s) => s.restore());
    headersStub.restore();
    restorePrisma();
  });

  it('returns VALIDATION_ERROR when called with positional args (limit, offset)', async () => {
    // Regression guard: the action expects a single object { limit, offset },
    // not positional args. A positional call must fail validation loudly.
    const result = await (getBookmarkedThreads() as unknown as (
      ...a: unknown[]
    ) => Promise<{ error: string | null; errorCode: string | null }>)(50, 0);
    expect(result.errorCode).to.equal('VALIDATION_ERROR');
  });

  it('succeeds when called with an object { limit, offset }', async () => {
    const result = await getBookmarkedThreads()({ limit: 50, offset: 0 });
    expect(result.error).to.be.null;
    expect(result.data).to.have.property('bookmarks');
  });
});

describe('Bookmarks action: setBookmarkStatus concurrency', () => {
  const THREAD_ID = 'ctestthreadid0001';
  const USER_ID = 'test-user-id';

  let sessionStubs: sinon.SinonStub[];
  let headersStub: sinon.SinonStub;
  let revalidateStub: sinon.SinonStub;
  // In-memory stand-in for the user_bookmarks unique (userId, threadId) row.
  let store: Map<string, { userId: string; threadId: string }>;
  let findUniqueCalls: number;
  let restorePrisma: () => void;

  const getSetBookmarkStatus = () => require('@/modules/bookmarks/actions').setBookmarkStatus;

  beforeEach(() => {
    sessionStubs = stubAuth();
    headersStub = sinon.stub(nextHeaders, 'headers').resolves(new Headers());
    // revalidatePath throws outside a request scope - the action only uses it
    // for cache invalidation, so no-op it here.
    revalidateStub = sinon.stub(require('next/cache'), 'revalidatePath').resolves();
    store = new Map();
    findUniqueCalls = 0;

    // Access check runs for real: a PUBLIC thread passes canAccessThread with
    // no further DB (see loadThreadContext/canAccessThread).
    restorePrisma = installFakePrisma({
      'thread.findUnique': async () => ({
        id: THREAD_ID,
        createdBy: USER_ID,
        visibility: 'PUBLIC',
      }),
      'userBookmark.upsert': async (args: {
        where: { userId_threadId: { userId: string; threadId: string } };
        create: { userId: string; threadId: string };
      }) => {
        const key = `${args.where.userId_threadId.userId}:${args.where.userId_threadId.threadId}`;
        if (!store.has(key)) {
          store.set(key, { ...args.create });
        }
        return { id: 'bookmark-id', ...store.get(key)! };
      },
      'userBookmark.delete': async (args: {
        where: { userId_threadId: { userId: string; threadId: string } };
      }) => {
        const key = `${args.where.userId_threadId.userId}:${args.where.userId_threadId.threadId}`;
        store.delete(key);
        return { id: '' };
      },
      // setBookmarkStatus must never read before writing - fail loudly if it does.
      'userBookmark.findUnique': async () => {
        findUniqueCalls += 1;
        throw new Error('read-then-write race');
      },
    });
  });

  afterEach(() => {
    sessionStubs.forEach((s) => s.restore());
    headersStub.restore();
    revalidateStub.restore();
    restorePrisma();
  });

  it('parallel setBookmarkStatus(true)xN succeeds with exactly 1 row', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => getSetBookmarkStatus()({ threadId: THREAD_ID, bookmarked: true }))
    );

    for (const result of results) {
      expect(result.errorCode).to.be.null;
      expect(result.data).to.deep.equal({ isBookmarked: true });
    }
    expect(store.size).to.equal(1);
    expect(store.has(`${USER_ID}:${THREAD_ID}`)).to.be.true;
    expect(findUniqueCalls).to.equal(0);
  });

  it('mixed writes are last-writer-wins with no duplicates', async () => {
    await getSetBookmarkStatus()({ threadId: THREAD_ID, bookmarked: true });
    expect(store.size).to.equal(1);

    const off = await getSetBookmarkStatus()({ threadId: THREAD_ID, bookmarked: false });
    expect(off.errorCode).to.be.null;
    expect(off.data).to.deep.equal({ isBookmarked: false });
    expect(store.size).to.equal(0);

    // Parallel mixed storm: every write lands, but the unique key keeps one row.
    await Promise.all([
      getSetBookmarkStatus()({ threadId: THREAD_ID, bookmarked: true }),
      getSetBookmarkStatus()({ threadId: THREAD_ID, bookmarked: true }),
      getSetBookmarkStatus()({ threadId: THREAD_ID, bookmarked: false }),
    ]);
    expect(store.size).to.be.at.most(1);

    // Deterministic last-writer-wins: sequential tail decides the final state.
    const last = await getSetBookmarkStatus()({ threadId: THREAD_ID, bookmarked: true });
    expect(last.data).to.deep.equal({ isBookmarked: true });
    expect(store.size).to.equal(1);
    expect(findUniqueCalls).to.equal(0);
  });
});

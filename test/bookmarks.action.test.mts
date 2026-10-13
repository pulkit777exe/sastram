import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { stubAuth } from '@/test/api/helpers';
import { prisma } from '@/lib/infrastructure/prisma';

const nextHeaders = require('next/headers');
const getBookmarkedThreads = () => require('@/modules/bookmarks/actions').getBookmarkedThreads;

describe('Bookmarks action: getBookmarkedThreads input contract', () => {
  let sessionStubs: sinon.SinonStub[];
  let headersStub: sinon.SinonStub;
  // Same save/assign/restore rule as below: sinon.stub does not intercept
  // Prisma 7 model delegates.
  let origFindMany: typeof prisma.userBookmark.findMany;
  let origCount: typeof prisma.userBookmark.count;

  beforeEach(() => {
    sessionStubs = stubAuth();
    headersStub = sinon.stub(nextHeaders, 'headers').resolves(new Headers());
    origFindMany = prisma.userBookmark.findMany;
    (prisma.userBookmark as unknown as Record<string, unknown>).findMany = (async () => []) as typeof prisma.userBookmark.findMany;
    origCount = prisma.userBookmark.count;
    (prisma.userBookmark as unknown as Record<string, unknown>).count = (async () => 0) as typeof prisma.userBookmark.count;
  });

  afterEach(() => {
    sessionStubs.forEach((s) => s.restore());
    headersStub.restore();
    (prisma.userBookmark as unknown as Record<string, unknown>).findMany = origFindMany;
    (prisma.userBookmark as unknown as Record<string, unknown>).count = origCount;
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
  // Prisma 7 model delegates do not honor sinon.stub (method dispatch
  // bypasses stubbed own-props); direct assignment DOES intercept calls.
  // So every prisma stub here uses save/assign/restore, never sinon.stub.
  // See notifications-dispatcher.test.mts for the established pattern.
  let origThreadFindUnique: typeof prisma.thread.findUnique;
  let origUpsert: typeof prisma.userBookmark.upsert;
  let origDelete: typeof prisma.userBookmark.delete;
  let origFindUnique: typeof prisma.userBookmark.findUnique;
  let findUniqueCalls: number;

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
    origThreadFindUnique = prisma.thread.findUnique;
    (prisma.thread as unknown as Record<string, unknown>).findUnique = (async () => ({
      id: THREAD_ID,
      createdBy: USER_ID,
      visibility: 'PUBLIC',
    })) as unknown as typeof prisma.thread.findUnique;

    origUpsert = prisma.userBookmark.upsert;
    (prisma.userBookmark as unknown as Record<string, unknown>).upsert = (async (args: {
      where: { userId_threadId: { userId: string; threadId: string } };
      create: { userId: string; threadId: string };
    }) => {
      const key = `${args.where.userId_threadId.userId}:${args.where.userId_threadId.threadId}`;
      if (!store.has(key)) {
        store.set(key, { ...args.create });
      }
      return { id: 'bookmark-id', ...store.get(key)! };
    }) as unknown as typeof prisma.userBookmark.upsert;

    origDelete = prisma.userBookmark.delete;
    (prisma.userBookmark as unknown as Record<string, unknown>).delete = (async (args: {
      where: { userId_threadId: { userId: string; threadId: string } };
    }) => {
      const key = `${args.where.userId_threadId.userId}:${args.where.userId_threadId.threadId}`;
      store.delete(key);
      return { id: '' };
    }) as unknown as typeof prisma.userBookmark.delete;

    // setBookmarkStatus must never read before writing - fail loudly if it does.
    origFindUnique = prisma.userBookmark.findUnique;
    (prisma.userBookmark as unknown as Record<string, unknown>).findUnique = (async () => {
      findUniqueCalls += 1;
      throw new Error('read-then-write race');
    }) as unknown as typeof prisma.userBookmark.findUnique;
  });

  afterEach(() => {
    sessionStubs.forEach((s) => s.restore());
    headersStub.restore();
    revalidateStub.restore();
    (prisma.thread as unknown as Record<string, unknown>).findUnique = origThreadFindUnique;
    (prisma.userBookmark as unknown as Record<string, unknown>).upsert = origUpsert;
    (prisma.userBookmark as unknown as Record<string, unknown>).delete = origDelete;
    (prisma.userBookmark as unknown as Record<string, unknown>).findUnique = origFindUnique;
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

import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { stubAuth } from '@/test/api/helpers';
import { prisma } from '@/lib/infrastructure/prisma';
import { getBookmarkedThreads } from '@/modules/bookmarks/actions';

const nextHeaders = require('next/headers');

describe('Bookmarks action: getBookmarkedThreads input contract', () => {
  let sessionStubs: sinon.SinonStub[];
  let findManyStub: sinon.SinonStub;
  let countStub: sinon.SinonStub;
  let headersStub: sinon.SinonStub;

  beforeEach(() => {
    sessionStubs = stubAuth();
    headersStub = sinon.stub(nextHeaders, 'headers').resolves(new Headers());
    findManyStub = sinon.stub(prisma.userBookmark, 'findMany').resolves([]);
    countStub = sinon.stub(prisma.userBookmark, 'count').resolves(0);
  });

  afterEach(() => {
    sessionStubs.forEach((s) => s.restore());
    headersStub.restore();
    findManyStub.restore();
    countStub.restore();
  });

  it('returns VALIDATION_ERROR when called with positional args (limit, offset)', async () => {
    // Regression guard: the action expects a single object { limit, offset },
    // not positional args. A positional call must fail validation loudly.
    const result = await (getBookmarkedThreads as unknown as (
      ...a: unknown[]
    ) => Promise<{ error: string | null; errorCode: string | null }>)(50, 0);
    expect(result.errorCode).to.equal('VALIDATION_ERROR');
  });

  it('succeeds when called with an object { limit, offset }', async () => {
    const result = await getBookmarkedThreads({ limit: 50, offset: 0 });
    expect(result.error).to.be.null;
    expect(result.data).to.have.property('bookmarks');
  });
});

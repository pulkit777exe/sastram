import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { mockRequest, stubAuth, stubHeaders, restoreStubs, createMockSession } from '../helpers';
import { prisma } from '@/lib/infrastructure/prisma';

const GET = () => require('@/app/api/ai/search-history/route').GET;
const DEL = () => require('@/app/api/ai/search-history/route').DELETE;

// Prisma proxy methods can't be safely stubbed with sinon (restore deletes them).
// Save originals at module load and manually replace/restore around each test.
const origFindFirst = (prisma.aiSearchSession as any).findFirst;
const origUpdateMany = (prisma.aiSearchSession as any).updateMany;

describe('GET /api/ai/search-history (harness §8 IDOR)', () => {
  let sinonStubs: import('sinon').SinonStub[] = [];

  beforeEach(() => {
    sinonStubs.push(stubHeaders());
    sinonStubs.push(...stubAuth(createMockSession({ id: 'user-A' })));
  });

  afterEach(() => {
    restoreStubs(...sinonStubs);
    sinonStubs = [];
    // Manually restore Prisma proxy methods (sinon.restore() corrupts them).
    (prisma.aiSearchSession as any).findFirst = origFindFirst;
    (prisma.aiSearchSession as any).updateMany = origUpdateMany;
  });

  it('returns a user-owned session with full structured synthesis', async () => {
    (prisma.aiSearchSession as any).findFirst = async () => ({
      id: 'sess-1',
      userId: 'user-A',
      query: 'how to center a div',
      queryType: 'technical',
      title: 'How to center a div',
      parentSessionId: null,
      createdAt: new Date(),
      results: [
        {
          synthesis: 'Use flexbox [1].',
          sourceCount: 1,
          citations: [{ marker: 1, sourceId: 'exa_1' }],
          followUps: ['Follow up one?'],
          conflictData: null,
          sources: [{ id: 'exa_1' }],
        },
      ],
    });

    const res = await GET()(
      mockRequest('/api/ai/search-history?id=sess-1', { method: 'GET' })
    );

    expect(res.status).to.equal(200);
    const body = await res.json();
    expect(body.data.synthesis).to.equal('Use flexbox [1].');
    expect(body.data.citations).to.deep.equal([{ marker: 1, sourceId: 'exa_1' }]);
    expect(body.data.followUps).to.deep.equal(['Follow up one?']);
  });

  it('returns 404 (not 500) for a session owned by another user — IDOR guard', async () => {
    (prisma.aiSearchSession as any).findFirst = async () => null;

    const res = await GET()(
      mockRequest('/api/ai/search-history?id=sess-foreign', { method: 'GET' })
    );

    expect(res.status).to.equal(404);
    const body = await res.json();
    expect(body.error.code).to.equal('NOT_FOUND');
  });

  it('soft-deletes only the requesting user\'s own sessions', async () => {
    const calls: unknown[] = [];
    (prisma.aiSearchSession as any).updateMany = async (args: unknown) => {
      calls.push(args);
      return { count: 1 };
    };

    const res = await DEL()(
      mockRequest('/api/ai/search-history?id=sess-1', { method: 'DELETE' })
    );

    expect(res.status).to.equal(200);
    expect(calls).to.have.length(1);
    expect((calls[0] as any).where).to.deep.include({ id: 'sess-1', userId: 'user-A' });
  });

  it('returns 404 when deleting a session that is not the user\'s', async () => {
    (prisma.aiSearchSession as any).updateMany = async () => ({ count: 0 });

    const res = await DEL()(
      mockRequest('/api/ai/search-history?id=sess-foreign', { method: 'DELETE' })
    );

    expect(res.status).to.equal(404);
  });
});

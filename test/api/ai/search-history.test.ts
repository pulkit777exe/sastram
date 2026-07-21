import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockRequest, stubAuth, stubHeaders, restoreStubs, createMockSession } from '../helpers';
import { prisma } from '@/lib/infrastructure/prisma';

const GET = () => require('@/app/api/ai/search-history/route').GET;
const DEL = () => require('@/app/api/ai/search-history/route').DELETE;

describe('GET /api/ai/search-history (harness §8 IDOR)', () => {
  let stubs: sinon.SinonStub[] = [];

  beforeEach(() => {
    stubs.push(stubHeaders());
    stubs.push(...stubAuth(createMockSession({ id: 'user-A' })));
  });

  afterEach(() => {
    restoreStubs(...stubs);
    stubs = [];
  });

  it('returns a user-owned session with full structured synthesis', async () => {
    stubs.push(
      sinon.stub(prisma.aiSearchSession, 'findFirst').resolves({
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
      } as never)
    );

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
    // The row exists in the DB but belongs to user-B; the query is scoped by
    // userId, so findFirst with { id, userId: 'user-A' } returns null.
    stubs.push(
      sinon.stub(prisma.aiSearchSession, 'findFirst').resolves(null)
    );

    const res = await GET()(
      mockRequest('/api/ai/search-history?id=sess-foreign', { method: 'GET' })
    );

    expect(res.status).to.equal(404);
    const body = await res.json();
    expect(body.error.code).to.equal('NOT_FOUND');
  });

  it('soft-deletes only the requesting user’s own sessions', async () => {
    stubs.push(
      sinon.stub(prisma.aiSearchSession, 'updateMany').resolves({ count: 1 } as never)
    );

    const res = await DEL()(
      mockRequest('/api/ai/search-history?id=sess-1', { method: 'DELETE' })
    );

    expect(res.status).to.equal(200);
    // Verify the delete was scoped to the user.
    const updateCall = (prisma.aiSearchSession.updateMany as sinon.SinonStub).getCall(0);
    expect(updateCall.args[0].where).to.deep.include({ id: 'sess-1', userId: 'user-A' });
  });

  it('returns 404 when deleting a session that is not the user’s', async () => {
    stubs.push(
      sinon.stub(prisma.aiSearchSession, 'updateMany').resolves({ count: 0 } as never)
    );

    const res = await DEL()(
      mockRequest('/api/ai/search-history?id=sess-foreign', { method: 'DELETE' })
    );

    expect(res.status).to.equal(404);
  });
});

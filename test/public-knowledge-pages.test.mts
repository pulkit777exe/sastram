import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import { installFakePrisma } from '@/test/support/fake-prisma';

describe('public knowledge routes', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('returns null for a non-public thread slug', async () => {
    let capturedWhere: unknown;
    restore = installFakePrisma({
      'thread.findFirst': async (args: { where: unknown }) => {
        capturedWhere = args.where;
        return null;
      },
    });
    const { getPublicThreadBySlug } = await import('@/lib/public-content/thread');
    const result = await getPublicThreadBySlug('private-thread');
    expect(result).to.equal(null);
    expect(capturedWhere).to.deep.include({ slug: 'private-thread', visibility: 'PUBLIC', deletedAt: null });
  });

  it('returns null for knowledge when thread is not an eligible public page', async () => {
    let capturedWhere: unknown;
    restore = installFakePrisma({
      'knowledgePage.findFirst': async (args: { where: unknown }) => {
        capturedWhere = args.where;
        return null;
      },
    });
    const { getPublicKnowledgeBySlug } = await import('@/lib/public-content/thread');
    const result = await getPublicKnowledgeBySlug('private-thread');
    expect(result).to.equal(null);
    expect(capturedWhere).to.deep.equal({
      thread: { slug: 'private-thread', visibility: 'PUBLIC', deletedAt: null, isOutdated: false, verifiedAt: { not: null } },
    });
  });

  it('marks low-quality unresolved or reported threads as noindex', async () => {
    const { shouldNoIndexThread } = await import('@/lib/public-content/thread');
    expect(
      shouldNoIndexThread(
        { verifiedAt: null, resolutionScore: 20, aiSummary: null, _count: { messages: 1 } },
        0
      )
    ).to.equal(true);
    expect(
      shouldNoIndexThread(
        { verifiedAt: null, resolutionScore: 90, aiSummary: 'summary', _count: { messages: 5 } },
        1
      )
    ).to.equal(true);
    expect(
      shouldNoIndexThread(
        { verifiedAt: new Date(), resolutionScore: 90, aiSummary: 'summary', _count: { messages: 5 } },
        0
      )
    ).to.equal(false);
  });
});

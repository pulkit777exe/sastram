import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import { installFakePrisma } from '@/test/support/fake-prisma';
import {
  KNOWLEDGE_PROMOTION_THRESHOLD,
  promoteThreadsToKnowledgePages,
} from '@/lib/services/knowledge-promotion';

describe('knowledge promotion', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('promotes only public, live, verified, current threads with a real aiSummary', async () => {
    let candidateWhere: unknown;
    const upserts: unknown[] = [];

    restore = installFakePrisma({
      'knowledgePage.deleteMany': async () => ({ count: 0 }),
      'thread.findMany': async (args: { where: unknown }) => {
        candidateWhere = args.where;
        return [
          { id: 'thread-no-summary', aiSummary: '   ' },
          { id: 'thread-ready', aiSummary: 'A real synthesized answer.' },
        ];
      },
      'knowledgePage.findUnique': async () => null,
      'knowledgePage.upsert': async (args: unknown) => {
        upserts.push(args);
        return { id: 'page-ready' };
      },
    });

    const result = await promoteThreadsToKnowledgePages();

    expect(candidateWhere).to.deep.include({
      visibility: 'PUBLIC',
      isOutdated: false,
      deletedAt: null,
      verifiedAt: { not: null },
      resolutionScore: { gt: KNOWLEDGE_PROMOTION_THRESHOLD },
    });
    expect(upserts).to.have.lengthOf(1);
    expect(upserts[0]).to.deep.equal({
      where: { threadId: 'thread-ready' },
      create: {
        threadId: 'thread-ready',
        synthesizedContent: 'A real synthesized answer.',
        version: 1,
      },
      update: {
        synthesizedContent: 'A real synthesized answer.',
        version: { increment: 1 },
      },
    });
    expect(result.created).to.equal(1);
    expect(result.skipped).to.equal(1);
  });

  it('never falls back to the thread name when aiSummary is missing', async () => {
    let upserted = false;

    restore = installFakePrisma({
      'knowledgePage.deleteMany': async () => ({ count: 0 }),
      'thread.findMany': async () => [{ id: 'thread-no-summary', aiSummary: null }],
      'knowledgePage.findUnique': async () => null,
      'knowledgePage.upsert': async () => {
        upserted = true;
        return { id: 'page' };
      },
    });

    const result = await promoteThreadsToKnowledgePages();

    expect(upserted).to.equal(false);
    expect(result.skipped).to.equal(1);
    expect(result.created).to.equal(0);
  });

  it('leaves an unchanged page alone and does not bump its version', async () => {
    let upserted = false;

    restore = installFakePrisma({
      'knowledgePage.deleteMany': async () => ({ count: 0 }),
      'thread.findMany': async () => [{ id: 'thread-ready', aiSummary: 'Same answer.' }],
      'knowledgePage.findUnique': async () => ({
        id: 'page-ready',
        synthesizedContent: 'Same answer.',
        version: 4,
      }),
      'knowledgePage.upsert': async () => {
        upserted = true;
        return { id: 'page-ready' };
      },
    });

    const result = await promoteThreadsToKnowledgePages();

    expect(upserted).to.equal(false);
    expect(result.unchanged).to.equal(1);
    expect(result.updated).to.equal(0);
  });

  it('bumps the version when the synthesized content changes', async () => {
    const upserts: unknown[] = [];

    restore = installFakePrisma({
      'knowledgePage.deleteMany': async () => ({ count: 0 }),
      'thread.findMany': async () => [{ id: 'thread-ready', aiSummary: 'New answer.' }],
      'knowledgePage.findUnique': async () => ({
        id: 'page-ready',
        synthesizedContent: 'Old answer.',
        version: 4,
      }),
      'knowledgePage.upsert': async (args: unknown) => {
        upserts.push(args);
        return { id: 'page-ready' };
      },
    });

    const result = await promoteThreadsToKnowledgePages();

    expect(result.updated).to.equal(1);
    expect(upserts[0]).to.deep.equal({
      where: { threadId: 'thread-ready' },
      create: {
        threadId: 'thread-ready',
        synthesizedContent: 'New answer.',
        version: 1,
      },
      update: {
        synthesizedContent: 'New answer.',
        version: { increment: 1 },
      },
    });
  });

  it('demotes pages whose thread is private, deleted, outdated, or below threshold', async () => {
    let demoteWhere: unknown;

    restore = installFakePrisma({
      'knowledgePage.deleteMany': async (args: { where: unknown }) => {
        demoteWhere = args.where;
        return { count: 3 };
      },
      'thread.findMany': async () => [],
    });

    const result = await promoteThreadsToKnowledgePages();

    expect(result.demoted).to.equal(3);
    expect(demoteWhere).to.deep.equal({
      thread: {
        OR: [
          { deletedAt: { not: null } },
          { visibility: { not: 'PUBLIC' } },
          { isOutdated: true },
          { verifiedAt: null },
          { resolutionScore: null },
          { resolutionScore: { lte: KNOWLEDGE_PROMOTION_THRESHOLD } },
        ],
      },
    });
  });
});

import { expect } from 'chai';
import { installFakePrisma } from '../support/fake-prisma';
import { forkThreadDomain, proposeSupersedeDomain, decideSupersedeDomain } from '@/modules/threads/mutations';

const fakeSideEffects = {
  slugExists: async () => false,
  copyThreadTags: async () => {},
  revalidateThreadPage: () => {},
  revalidateDashboard: () => {},
  enqueueInitialAiJobs: async () => {},
  recordActivity: async () => ({}) as any,
  refreshExpertise: () => {},
};

describe('Phase 5 forking domain', () => {
  it('rejects widening visibility from a private source', async () => {
    const restore = installFakePrisma({
      'thread.findUnique': async () => ({
        id: 'src1', name: 'Source', description: 'secret', visibility: 'PRIVATE',
        createdBy: 'owner', slug: 'source', aiSummary: 'sum',
      }),
    });
    try {
      let err: unknown;
      try {
        await forkThreadDomain({ sourceThreadId: 'src1', userId: 'u1', visibility: 'PUBLIC', sideEffects: fakeSideEffects as any });
      } catch (e) { err = e; }
      expect(err).to.be.instanceOf(Error);
      expect((err as any).code).to.equal('FORBIDDEN');
    } finally {
      restore();
    }
  });

  it('creates fork with SUMMARY carry-over snapshot and notifies parent OP once', async () => {
    const calls: any[] = [];
    let created: any = null;
    const restore = installFakePrisma({
      'thread.findUnique': async ({ where }: any) => {
        if (where.id === 'src2') return { id: 'src2', name: 'Source', description: 'desc', visibility: 'PUBLIC', createdBy: 'op1', slug: 'source', aiSummary: 'AI summary text' };
        if (where.id) return { createdBy: 'op1' };
        return null;
      },
      'thread.create': async ({ data }: any) => { created = data; return { id: 'fork1', slug: data.slug, name: data.name }; },
      'threadTagRelation.findMany': async () => [],
      'user.findMany': async () => [{ id: 'op1' }],
      'notification.createMany': async (args: any) => { calls.push(args); return { count: 1 }; },
    });
    try {
      const res = await forkThreadDomain({ sourceThreadId: 'src2', userId: 'u2', visibility: 'PUBLIC', carryOverMode: 'SUMMARY', sideEffects: fakeSideEffects as any });
      expect(res.id).to.equal('fork1');
      expect(created.carryOverMode).to.equal('SUMMARY');
      expect(created.carryOverSnapshot).to.include('AI summary snapshot');
      expect(created.forkKind).to.equal('CONTINUE');
      expect(calls.length).to.equal(1);
      expect(calls[0].data[0].userId).to.equal('op1');
    } finally {
      restore();
    }
  });

  it('propose/accept/decline supersede enforces permissions and transitions', async () => {
    const updates: any[] = [];
    const restore = installFakePrisma({
      'thread.findUnique': async ({ where }: any) => {
        if (where.id === 'forkA') return { id: 'forkA', createdBy: 'author', forkedFromId: 'parentA', name: 'Fork', slug: 'fork', supersedeStatus: 'PROPOSED' };
        if (where.id === 'parentA') return { createdBy: 'op' };
        return null;
      },
      'thread.update': async ({ data }: any) => { updates.push(data); return { id: 'forkA' }; },
      'user.findMany': async () => [{ id: 'op' }],
      'notification.createMany': async () => ({ count: 1 }),
    });
    try {
      await proposeSupersedeDomain({ forkThreadId: 'forkA', userId: 'author', reason: 'better' });
      expect(updates[0].supersedeStatus).to.equal('PROPOSED');

      let err: unknown;
      try {
        await decideSupersedeDomain({ forkThreadId: 'forkA', userId: 'stranger', decision: 'ACCEPTED' });
      } catch (e) { err = e; }
      expect((err as any).code).to.equal('FORBIDDEN');

      await decideSupersedeDomain({ forkThreadId: 'forkA', userId: 'op', decision: 'ACCEPTED' });
      expect(updates[updates.length - 1].supersedeStatus).to.equal('ACCEPTED');

      await decideSupersedeDomain({ forkThreadId: 'forkA', userId: 'op', decision: 'DECLINED' });
      expect(updates[updates.length - 1].supersedeStatus).to.equal('DECLINED');
    } finally {
      restore();
    }
  });
});

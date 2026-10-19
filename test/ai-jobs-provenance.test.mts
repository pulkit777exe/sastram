import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import { installFakePrisma } from '@/test/support/fake-prisma';
import { handleStalenessCheckJob, handleConflictDetectionJob } from '@/lib/queue/workers/ai-jobs';
import { aiService } from '@/lib/ai';

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

// Marking writes must never fabricate score provenance: lastVerifiedAt is the
// trust-decay basis and is written only when a resolution score is computed.
describe('AI job marking writes only isOutdated', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('single-thread staleness marks isOutdated without writing lastVerifiedAt', async () => {
    const updates: unknown[] = [];
    restore = installFakePrisma({
      'thread.findFirst': async () => ({ id: 't1', lastVerifiedAt: daysAgo(200), verifiedAt: null, isOutdated: false }),
      'thread.update': async (args: unknown) => {
        updates.push(args);
        return {};
      },
    });

    const result = await handleStalenessCheckJob({ threadId: 't1' });

    expect(result).to.deep.equal({ handled: true, checked: 1, updated: 1 });
    expect(updates).to.deep.equal([{ where: { id: 't1' }, data: { isOutdated: true } }]);
  });

  it('keeps a thread trusted when a fresh human verification exists', async () => {
    let updates = 0;
    restore = installFakePrisma({
      'thread.findFirst': async () => ({ id: 't1', lastVerifiedAt: daysAgo(400), verifiedAt: daysAgo(3), isOutdated: false }),
      'thread.update': async () => {
        updates += 1;
        return {};
      },
    });

    const result = await handleStalenessCheckJob({ threadId: 't1' });

    expect(result).to.deep.equal({ handled: true, checked: 1, updated: 0 });
    expect(updates).to.equal(0);
  });

  it('batch staleness sweep marks stale ids without writing lastVerifiedAt', async () => {
    const batchUpdates: unknown[] = [];
    restore = installFakePrisma({
      'thread.findMany': async () => [
        { id: 'stale', lastVerifiedAt: daysAgo(200), verifiedAt: null },
        { id: 'fresh', lastVerifiedAt: daysAgo(2), verifiedAt: null },
      ],
      'thread.updateMany': async (args: unknown) => {
        batchUpdates.push(args);
        return { count: 1 };
      },
    });

    const result = await handleStalenessCheckJob({ cronJob: true });

    expect(result).to.deep.equal({ handled: true, checked: 2, updated: 1 });
    expect(batchUpdates).to.deep.equal([{ where: { id: { in: ['stale'] } }, data: { isOutdated: true } }]);
  });

  it('conflict detection marks isOutdated without writing lastVerifiedAt', async () => {
    const updates: unknown[] = [];
    const original = (aiService as unknown as { detectConflicts: unknown }).detectConflicts;
    (aiService as unknown as { detectConflicts: unknown }).detectConflicts = async () => ({
      hasConflict: true,
      reason: 'contradictory sources',
    });
    try {
      restore = installFakePrisma({
        'thread.findUnique': async () => null,
        'thread.update': async (args: unknown) => {
          updates.push(args);
          return {};
        },
      });

      const result = await handleConflictDetectionJob({ threadId: 't1', messages: [] } as never);

      expect(result.conflictResult?.hasConflict).to.equal(true);
      expect(updates).to.deep.equal([{ where: { id: 't1' }, data: { isOutdated: true } }]);
    } finally {
      (aiService as unknown as { detectConflicts: unknown }).detectConflicts = original;
    }
  });
});

import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import { installFakePrisma } from '@/test/support/fake-prisma';
import { claimBounties } from '@/modules/bounties/repository';

describe('claimBounties', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('settles every unclaimed row in one atomic update', async () => {
    let updateArgs: unknown;
    restore = installFakePrisma({
      'bounty.updateManyAndReturn': async (args: unknown) => {
        updateArgs = args;
        return [{ amount: 10 }, { amount: 15 }];
      },
    });

    const result = await claimBounties('thread-1');

    expect(result).to.deep.equal({ count: 2, amount: 25 });
    expect(updateArgs).to.deep.equal({
      where: { threadId: 'thread-1', isClaimed: false },
      data: { isClaimed: true },
      select: { amount: true },
    });
  });

  it('returns zero when nothing is left to claim', async () => {
    restore = installFakePrisma({
      'bounty.updateManyAndReturn': async () => [],
    });

    expect(await claimBounties('thread-1')).to.deep.equal({ count: 0, amount: 0 });
  });
});

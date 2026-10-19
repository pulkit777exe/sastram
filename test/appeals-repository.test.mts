import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import { prisma } from '@/lib/infrastructure/prisma';
import { counted, installFakePrisma } from '@/test/support/fake-prisma';
import {
  castAppealVote,
  createJuryVotes,
  finalizeAppealResolution,
  listActiveBansForUsers,
} from '@/modules/appeals/repository';

type CapturedArgs = Record<string, unknown>;

interface FakeTransaction {
  calls: {
    appealUpdate: CapturedArgs[];
    banUpdateMany: CapturedArgs[];
    banCount: CapturedArgs[];
    userUpdate: CapturedArgs[];
    transactions: number;
  };
}

/**
 * `installFakePrisma` covers model.method only, so the transaction itself is
 * replaced by direct assignment (the same interception strategy as the shared
 * helper — Prisma 7 delegates bypass sinon stubs but honor assignment).
 */
function installFakeTransaction(remainingBanCount = 0): FakeTransaction {
  const fake: FakeTransaction = {
    calls: { appealUpdate: [], banUpdateMany: [], banCount: [], userUpdate: [], transactions: 0 },
  };
  const tx = {
    appeal: {
      update: async (args: CapturedArgs) => {
        fake.calls.appealUpdate.push(args);
        return {};
      },
    },
    userBan: {
      updateMany: async (args: CapturedArgs) => {
        fake.calls.banUpdateMany.push(args);
        return { count: 1 };
      },
      count: async (args: CapturedArgs) => {
        fake.calls.banCount.push(args);
        return remainingBanCount;
      },
    },
    user: {
      update: async (args: CapturedArgs) => {
        fake.calls.userUpdate.push(args);
        return {};
      },
    },
  };

  const original = prisma.$transaction;
  (prisma as unknown as Record<string, unknown>).$transaction = (async (fn: (client: unknown) => unknown) => {
    fake.calls.transactions += 1;
    return fn(tx);
  }) as typeof prisma.$transaction;
  restores.push(() => {
    prisma.$transaction = original;
  });
  return fake;
}

const restores: Array<() => void> = [];

describe('Appeals Repository (fake-prisma seam)', () => {
  afterEach(() => {
    while (restores.length) restores.pop()!();
  });

  describe('finalizeAppealResolution', () => {
    it('approval sets status APPROVED and lifts the ban, restoring the account to ACTIVE', async () => {
      const tx = installFakeTransaction(0);

      await finalizeAppealResolution({
        appealId: 'appeal-1',
        appealUserId: 'user-1',
        approved: true,
        response: 'Welcome back',
        moderatorId: 'mod-1',
      });

      expect(tx.calls.transactions).to.equal(1);
      expect(tx.calls.appealUpdate).to.have.lengthOf(1);
      const update = tx.calls.appealUpdate[0]!;
      expect(update.where).to.deep.equal({ id: 'appeal-1' });
      const data = update.data as Record<string, unknown>;
      expect(data.status).to.equal('APPROVED');
      expect(data.moderatorId).to.equal('mod-1');
      expect(data.response).to.equal('Welcome back');
      expect(data.resolvedAt).to.be.instanceOf(Date);

      expect(tx.calls.banUpdateMany).to.deep.equal([
        { where: { userId: 'user-1', isActive: true }, data: { isActive: false } },
      ]);
      expect(tx.calls.banCount).to.deep.equal([{ where: { userId: 'user-1', isActive: true } }]);
      expect(tx.calls.userUpdate).to.deep.equal([{ where: { id: 'user-1' }, data: { status: 'ACTIVE' } }]);
    });

    it('approval keeps the account banned while another active ban remains', async () => {
      const tx = installFakeTransaction(1);

      await finalizeAppealResolution({
        appealId: 'appeal-1',
        appealUserId: 'user-1',
        approved: true,
        response: undefined,
        moderatorId: 'mod-1',
      });

      expect(tx.calls.appealUpdate[0]!.data).to.include({ status: 'APPROVED', response: null });
      expect(tx.calls.banUpdateMany).to.have.lengthOf(1);
      expect(tx.calls.userUpdate).to.have.lengthOf(0);
    });

    it('rejection sets status REJECTED and never touches bans or the account', async () => {
      const tx = installFakeTransaction();

      await finalizeAppealResolution({
        appealId: 'appeal-2',
        appealUserId: 'user-2',
        approved: false,
        response: 'Not this time',
        moderatorId: 'mod-2',
      });

      expect(tx.calls.appealUpdate).to.have.lengthOf(1);
      expect(tx.calls.appealUpdate[0]!.data).to.include({ status: 'REJECTED', response: 'Not this time' });
      expect(tx.calls.banUpdateMany).to.have.lengthOf(0);
      expect(tx.calls.banCount).to.have.lengthOf(0);
      expect(tx.calls.userUpdate).to.have.lengthOf(0);
    });

    it('approval of an appeal with no user does not attempt ban operations', async () => {
      const tx = installFakeTransaction();

      await finalizeAppealResolution({
        appealId: 'appeal-3',
        appealUserId: null,
        approved: true,
        response: undefined,
        moderatorId: 'mod-3',
      });

      expect(tx.calls.appealUpdate[0]!.data).to.include({ status: 'APPROVED' });
      expect(tx.calls.banUpdateMany).to.have.lengthOf(0);
      expect(tx.calls.userUpdate).to.have.lengthOf(0);
    });
  });

  describe('castAppealVote', () => {
    it('updates the assigned row by id with the vote and reason', async () => {
      const captured: CapturedArgs[] = [];
      restores.push(
        installFakePrisma({
          'appealVote.update': counted(async (args: CapturedArgs) => {
            captured.push(args);
            return { id: 'vote-1', vote: 'APPROVED' };
          }),
        })
      );

      const result = await castAppealVote('vote-1', 'APPROVED', 'looks good');

      expect(result).to.deep.equal({ id: 'vote-1', vote: 'APPROVED' });
      expect(captured).to.deep.equal([
        { where: { id: 'vote-1' }, data: { vote: 'APPROVED', reason: 'looks good' } },
      ]);
    });

    it('persists a null reason when the moderator leaves a response', async () => {
      const captured: CapturedArgs[] = [];
      restores.push(
        installFakePrisma({
          'appealVote.update': counted(async (args: CapturedArgs) => {
            captured.push(args);
            return {};
          }),
        })
      );

      await castAppealVote('vote-2', 'REJECTED', null);

      expect(captured[0]!.data).to.deep.equal({ vote: 'REJECTED', reason: null });
    });
  });

  describe('createJuryVotes', () => {
    it('inserts one pending row per juror and skips duplicates', async () => {
      const captured: CapturedArgs[] = [];
      restores.push(
        installFakePrisma({
          'appealVote.createMany': counted(async (args: CapturedArgs) => {
            captured.push(args);
            return { count: 2 };
          }),
        })
      );

      const result = await createJuryVotes('appeal-1', ['mod-1', 'mod-2']);

      expect(result).to.deep.equal({ count: 2 });
      expect(captured).to.deep.equal([
        {
          data: [
            { appealId: 'appeal-1', moderatorId: 'mod-1', vote: null, reason: null },
            { appealId: 'appeal-1', moderatorId: 'mod-2', vote: null, reason: null },
          ],
          skipDuplicates: true,
        },
      ]);
    });
  });

  describe('listActiveBansForUsers', () => {
    it('short-circuits an empty user list without querying', async () => {
      expect(await listActiveBansForUsers([])).to.deep.equal([]);
    });
  });
});

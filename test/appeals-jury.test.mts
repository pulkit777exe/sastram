import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  lookupJurorVote,
  pickJurors,
  requiredMajority,
  tallyVotes,
  voteForApproval,
} from '@/modules/appeals/jury';

const approve = { moderatorId: 'm1', vote: 'APPROVED' as const };
const reject = { moderatorId: 'm2', vote: 'REJECTED' as const };
const pending = (moderatorId: string) => ({ moderatorId, vote: null });

describe('Appeals Jury (pure domain)', () => {
  describe('requiredMajority', () => {
    it('is 2 for the production jury size of 3 (2/3 threshold)', () => {
      expect(requiredMajority(3)).to.equal(2);
    });

    it('rounds 2/3 up for larger juries and never drops below 1', () => {
      expect(requiredMajority(4)).to.equal(3);
      expect(requiredMajority(6)).to.equal(4);
      expect(requiredMajority(1)).to.equal(1);
      expect(requiredMajority(0)).to.equal(1);
    });
  });

  describe('tallyVotes', () => {
    it('unanimous approve: all three voted, approved', () => {
      const t = tallyVotes([approve, approve, approve], 3);
      expect(t).to.deep.equal({
        totalVotes: 3,
        approvedCount: 3,
        rejectedCount: 0,
        pendingCount: 0,
        majorityRequired: 2,
        sizeSufficient: true,
        majorityReached: true,
        allVoted: true,
        shouldResolve: true,
        approved: true,
      });
    });

    it('2/3 boundary: resolves approve as soon as two approvals land, before the third votes', () => {
      const t = tallyVotes([approve, approve, pending('m3')], 3);
      expect(t.approvedCount).to.equal(2);
      expect(t.pendingCount).to.equal(1);
      expect(t.majorityReached).to.equal(true);
      expect(t.allVoted).to.equal(false);
      expect(t.shouldResolve).to.equal(true);
      expect(t.approved).to.equal(true);
    });

    it('2 approve vs 1 reject: resolved approved', () => {
      const t = tallyVotes([approve, approve, reject], 3);
      expect(t.approvedCount).to.equal(2);
      expect(t.rejectedCount).to.equal(1);
      expect(t.majorityReached).to.equal(true);
      expect(t.shouldResolve).to.equal(true);
      expect(t.approved).to.equal(true);
    });

    it('1 approve vs 2 reject: resolved rejected', () => {
      const t = tallyVotes([approve, reject, reject], 3);
      expect(t.rejectedCount).to.equal(2);
      expect(t.majorityReached).to.equal(true);
      expect(t.approved).to.equal(false);
    });

    it('one reject plus one pending is not a majority yet', () => {
      const t = tallyVotes([reject, pending('m2'), pending('m3')], 3);
      expect(t.approvedCount).to.equal(0);
      expect(t.rejectedCount).to.equal(1);
      expect(t.pendingCount).to.equal(2);
      expect(t.majorityReached).to.equal(false);
      expect(t.allVoted).to.equal(false);
      expect(t.shouldResolve).to.equal(false);
      expect(t.approved).to.equal(false);
    });

    it('split 1-1-1 stays open: no majority and someone has not voted', () => {
      const t = tallyVotes([approve, reject, pending('m3')], 3);
      expect(t.majorityReached).to.equal(false);
      expect(t.allVoted).to.equal(false);
      expect(t.shouldResolve).to.equal(false);
    });

    it('all pending: nothing to resolve', () => {
      const t = tallyVotes([pending('m1'), pending('m2'), pending('m3')], 3);
      expect(t.approvedCount).to.equal(0);
      expect(t.rejectedCount).to.equal(0);
      expect(t.pendingCount).to.equal(3);
      expect(t.shouldResolve).to.equal(false);
    });

    it('all voted without a 2/3 majority still resolves (tie-break as rejected)', () => {
      const t = tallyVotes([approve, approve, reject, reject], 4);
      expect(t.majorityRequired).to.equal(3);
      expect(t.majorityReached).to.equal(false);
      expect(t.allVoted).to.equal(true);
      expect(t.shouldResolve).to.equal(true);
      expect(t.approved).to.equal(false);
    });

    it('fewer jurors than required: sizeSufficient is false even when a majority exists', () => {
      const t = tallyVotes([approve, approve], 3);
      expect(t.totalVotes).to.equal(2);
      expect(t.sizeSufficient).to.equal(false);
      expect(t.majorityReached).to.equal(true);
      expect(t.shouldResolve).to.equal(true);
      expect(t.approved).to.equal(true);
    });

    it('a single vote on a degraded jury cannot decide (caller gates on sizeSufficient)', () => {
      const t = tallyVotes([approve], 3);
      expect(t.sizeSufficient).to.equal(false);
      expect(t.majorityReached).to.equal(false);
      expect(t.allVoted).to.equal(true);
      expect(t.shouldResolve).to.equal(true);
      expect(t.approved).to.equal(true);
    });

    it('zero votes: vacuous allVoted, no approval, sizeSufficient false', () => {
      const t = tallyVotes([], 3);
      expect(t.totalVotes).to.equal(0);
      expect(t.pendingCount).to.equal(0);
      expect(t.sizeSufficient).to.equal(false);
      expect(t.allVoted).to.equal(true);
      expect(t.shouldResolve).to.equal(true);
      expect(t.approved).to.equal(false);
    });

    it('unknown vote values are counted as neither approved, rejected, nor pending', () => {
      const stray = { moderatorId: 'm1', vote: 'ABSTAIN' };
      const t = tallyVotes([stray, pending('m2'), pending('m3')], 3);
      expect(t.approvedCount).to.equal(0);
      expect(t.rejectedCount).to.equal(0);
      expect(t.pendingCount).to.equal(2);
      expect(t.allVoted).to.equal(false);
      expect(t.shouldResolve).to.equal(false);
    });

    it('a jury of one resolves on a single approval of the smaller quorum', () => {
      const t = tallyVotes([approve], 1);
      expect(t.majorityRequired).to.equal(1);
      expect(t.sizeSufficient).to.equal(true);
      expect(t.majorityReached).to.equal(true);
      expect(t.shouldResolve).to.equal(true);
      expect(t.approved).to.equal(true);
    });
  });

  describe('tallyVotes ≡ legacy inline algorithm (exhaustive, jury size 3)', () => {
    // Oracle: the exact decision logic that lived in resolveAppeal before the
    // extraction (JURY_SIZE=3, JURY_MAJORITY=2).
    function legacyDecision(votes: Array<'APPROVED' | 'REJECTED' | null>) {
      const approvedCount = votes.filter((v) => v === 'APPROVED').length;
      const rejectedCount = votes.filter((v) => v === 'REJECTED').length;
      const pendingCount = votes.filter((v) => v === null).length;
      const majorityReached = approvedCount >= 2 || rejectedCount >= 2;
      const allVoted = pendingCount === 0;
      return {
        approvedCount,
        rejectedCount,
        pendingCount,
        sizeSufficient: votes.length >= 3,
        finalShouldResolve: majorityReached || allVoted,
        finalApproved: approvedCount > rejectedCount,
      };
    }

    const values: Array<'APPROVED' | 'REJECTED' | null> = ['APPROVED', 'REJECTED', null];
    const combinations: Array<Array<'APPROVED' | 'REJECTED' | null>> = [];
    for (let length = 0; length <= 4; length++) {
      const total = 3 ** length;
      for (let n = 0; n < total; n++) {
        const combo: Array<'APPROVED' | 'REJECTED' | null> = [];
        let cursor = n;
        for (let i = 0; i < length; i++) {
          combo.push(values[cursor % 3]!);
          cursor = Math.floor(cursor / 3);
        }
        combinations.push(combo);
      }
    }

    it(`matches on all ${combinations.length} vote-shape combinations`, () => {
      for (const votes of combinations) {
        const expected = legacyDecision(votes);
        const tally = tallyVotes(votes.map((vote, i) => ({ moderatorId: `m${i}`, vote })), 3);
        expect(tally.approvedCount, JSON.stringify(votes)).to.equal(expected.approvedCount);
        expect(tally.rejectedCount, JSON.stringify(votes)).to.equal(expected.rejectedCount);
        expect(tally.pendingCount, JSON.stringify(votes)).to.equal(expected.pendingCount);
        expect(tally.sizeSufficient, JSON.stringify(votes)).to.equal(expected.sizeSufficient);
        expect(tally.shouldResolve, JSON.stringify(votes)).to.equal(expected.finalShouldResolve);
        expect(tally.approved, JSON.stringify(votes)).to.equal(expected.finalApproved);
        expect(tally.majorityRequired).to.equal(2);
      }
    });
  });

  describe('lookupJurorVote', () => {
    it('reports NOT_ASSIGNED for a moderator with no vote row', () => {
      expect(lookupJurorVote([approve, pending('m3')], 'stranger').status).to.equal('NOT_ASSIGNED');
    });

    it('returns the assigned pending row as CAN_VOTE', () => {
      const row = pending('m3');
      const result = lookupJurorVote([approve, row], 'm3');
      expect(result.status).to.equal('CAN_VOTE');
      if (result.status === 'CAN_VOTE') {
        expect(result.vote).to.equal(row);
      }
    });

    it('reports ALREADY_VOTED for a juror who has cast a vote', () => {
      const result = lookupJurorVote([approve], 'm1');
      expect(result.status).to.equal('ALREADY_VOTED');
      if (result.status === 'ALREADY_VOTED') {
        expect(result.vote.vote).to.equal('APPROVED');
      }
    });
  });

  describe('voteForApproval', () => {
    it('maps approvals to APPROVED and rejections to REJECTED', () => {
      expect(voteForApproval(true)).to.equal('APPROVED');
      expect(voteForApproval(false)).to.equal('REJECTED');
    });
  });

  describe('pickJurors', () => {
    it('is deterministic when rng is injected', () => {
      const zero = () => 0;
      expect(pickJurors(['a', 'b', 'c'], 3, zero)).to.deep.equal(['b', 'c', 'a']);
      expect(pickJurors(['a', 'b', 'c'], 3, zero)).to.deep.equal(pickJurors(['a', 'b', 'c'], 3, zero));
    });

    it('preserves order when rng always picks the current index (rng → 1)', () => {
      expect(pickJurors(['a', 'b', 'c'], 3, () => 0.999999)).to.deep.equal(['a', 'b', 'c']);
    });

    it('returns unique ids only', () => {
      const ids = ['m1', 'm2', 'm3', 'm4', 'm5'];
      const picked = pickJurors(ids, 3);
      expect(picked).to.have.lengthOf(3);
      expect(new Set(picked).size).to.equal(3);
      for (const id of picked) {
        expect(ids).to.include(id);
      }
    });

    it('de-duplicates input ids', () => {
      const picked = pickJurors(['a', 'a', 'b'], 3, () => 0);
      expect(picked).to.have.lengthOf(2);
      expect(new Set(picked)).to.have.keys(['a', 'b']);
    });

    it('clamps size above the pool down to the pool size', () => {
      expect(pickJurors(['a', 'b'], 10, () => 0)).to.have.lengthOf(2);
    });

    it('returns [] for zero, negative, or empty inputs', () => {
      expect(pickJurors(['a', 'b'], 0)).to.deep.equal([]);
      expect(pickJurors(['a', 'b'], -1)).to.deep.equal([]);
      expect(pickJurors([], 3)).to.deep.equal([]);
    });

    it('does not mutate the input array', () => {
      const ids = ['a', 'b', 'c'];
      pickJurors(ids, 2, () => 0);
      expect(ids).to.deep.equal(['a', 'b', 'c']);
    });
  });
});

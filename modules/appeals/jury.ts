/**
 * Pure appeal-jury domain logic.
 *
 * Extracted from modules/appeals/actions.ts so the voting rules are unit
 * testable without a database or session. No imports, no I/O — callers fetch
 * rows via modules/appeals/repository.ts and pass them in.
 *
 * The semantics below mirror the previous inline implementation exactly:
 * a jury needs `requiredSize` assigned jurors; a decision needs a 2/3
 * majority on either side, or every assigned juror to have voted. The winner
 * is the side with strictly more votes; ties and empty juries resolve as
 * rejected (conservative).
 */

export type AppealVoteValue = 'APPROVED' | 'REJECTED';

export interface AppealVoteLike {
  moderatorId: string;
  vote: string | null;
}

export interface JuryTally {
  /** Number of vote rows (assigned jurors), not the number of votes cast. */
  totalVotes: number;
  approvedCount: number;
  rejectedCount: number;
  pendingCount: number;
  /** 2/3 of requiredSize, rounded up (2 for the production jury size of 3). */
  majorityRequired: number;
  /** False when the jury has fewer rows than requiredSize — a degraded jury cannot decide. */
  sizeSufficient: boolean;
  majorityReached: boolean;
  allVoted: boolean;
  shouldResolve: boolean;
  /** Winner rule: strictly more approvals than rejections; ties resolve as rejected. */
  approved: boolean;
}

const JURY_APPROVAL_NUMERATOR = 2;
const JURY_APPROVAL_DENOMINATOR = 3;

/** 2/3 majority threshold for a jury of `requiredSize`; at least 1. */
export function requiredMajority(requiredSize: number): number {
  return Math.max(1, Math.ceil((requiredSize * JURY_APPROVAL_NUMERATOR) / JURY_APPROVAL_DENOMINATOR));
}

/**
 * Counts votes and decides whether the appeal can be resolved.
 *
 * `votes` is the full set of assigned juror rows (pending rows have vote=null).
 * Faithful edge cases from the legacy inline logic:
 * - unknown vote strings are neither approved, rejected, nor pending
 *   (the DB enum makes them impossible, but counts stay literal);
 * - an empty array is vacuously `allVoted` and `shouldResolve`, so callers
 *   must gate on `sizeSufficient` first — the production path checks the
 *   jury size before consulting `shouldResolve`.
 */
export function tallyVotes(votes: Array<{ vote: string | null }>, requiredSize: number): JuryTally {
  const approvedCount = votes.filter((v) => v.vote === 'APPROVED').length;
  const rejectedCount = votes.filter((v) => v.vote === 'REJECTED').length;
  const pendingCount = votes.filter((v) => v.vote === null).length;

  const majorityRequired = requiredMajority(requiredSize);
  const majorityReached = approvedCount >= majorityRequired || rejectedCount >= majorityRequired;
  const allVoted = pendingCount === 0;

  return {
    totalVotes: votes.length,
    approvedCount,
    rejectedCount,
    pendingCount,
    majorityRequired,
    sizeSufficient: votes.length >= requiredSize,
    majorityReached,
    allVoted,
    shouldResolve: majorityReached || allVoted,
    approved: approvedCount > rejectedCount,
  };
}

export type JurorVoteLookup<T extends AppealVoteLike> =
  | { status: 'NOT_ASSIGNED' }
  | { status: 'ALREADY_VOTED'; vote: T }
  | { status: 'CAN_VOTE'; vote: T };

/** Finds the caller's assigned vote row and whether they may still vote on it. */
export function lookupJurorVote<T extends AppealVoteLike>(votes: T[], moderatorId: string): JurorVoteLookup<T> {
  const vote = votes.find((v) => v.moderatorId === moderatorId);
  if (!vote) return { status: 'NOT_ASSIGNED' };
  if (vote.vote !== null) return { status: 'ALREADY_VOTED', vote };
  return { status: 'CAN_VOTE', vote };
}

/** Maps an approval decision to the persisted vote enum value. */
export function voteForApproval(approved: boolean): AppealVoteValue {
  return approved ? 'APPROVED' : 'REJECTED';
}

/**
 * Fisher-Yates selection (matching the legacy shuffle) of up to `size` ids.
 *
 * Deterministic when `rng` is injected. Input ids are de-duplicated, which is
 * a no-op for rows read from the database's unique id column but guarantees
 * the result contains unique ids. Never mutates the input.
 */
export function pickJurors(moderatorIds: string[], size: number, rng: () => number = Math.random): string[] {
  const ids = [...new Set(moderatorIds)];
  if (ids.length === 0 || size <= 0) return [];

  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = ids[i]!;
    ids[i] = ids[j]!;
    ids[j] = tmp;
  }

  return ids.slice(0, Math.min(size, ids.length));
}

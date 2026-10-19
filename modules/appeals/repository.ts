/**
 * Prisma access for the appeals module.
 *
 * Extracted from modules/appeals/actions.ts with identical query semantics:
 * the actions keep session/auth/zod/revalidation and orchestration, this
 * module owns every database call.
 */
import type { AppealVoteDecision } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';

// ── Shared selects ──────────────────────────────────────────────────────────
export const APPEAL_USER_SELECT = { id: true, name: true, email: true, image: true } as const;

// ── submitAppeal ────────────────────────────────────────────────────────────

// Appeal rows hang off a message, but a ban isn't always traceable to one.
// Walk from the most specific evidence to the least: the cited report, then any
// report against this user, then their last message.
export async function resolveAppealMessageId(userId: string, reportId?: string): Promise<string | null> {
  if (reportId) {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      select: { messageId: true },
    });
    if (report !== null) {
      return report.messageId;
    }
  }

  const banReport = await prisma.report.findFirst({
    where: { message: { senderId: userId } },
    orderBy: { createdAt: 'desc' },
    select: { messageId: true },
  });
  if (banReport !== null) {
    return banReport.messageId;
  }

  const lastMessage = await prisma.message.findFirst({
    where: { senderId: userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (lastMessage === null) {
    return null;
  }
  return lastMessage.id;
}

export async function findActiveBanForUser(userId: string) {
  return prisma.userBan.findFirst({
    where: { userId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function findPendingAppealForUser(userId: string) {
  return prisma.appeal.findFirst({ where: { userId, status: 'PENDING' } });
}

export async function createAppeal(params: { messageId: string; userId: string; reason: string }) {
  return prisma.appeal.create({
    data: { messageId: params.messageId, userId: params.userId, status: 'PENDING', reason: params.reason },
  });
}

export async function listActiveModeratorIds(excludeUserId?: string | null): Promise<string[]> {
  const moderators = await prisma.user.findMany({
    where: {
      role: 'MODERATOR',
      status: 'ACTIVE',
      deletedAt: null,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });
  return moderators.map((m) => m.id);
}

// Uniqueness is enforced by the [appealId, moderatorId] unique constraint;
// skipDuplicates keeps a repeated assignment from failing the whole jury.
export async function createJuryVotes(appealId: string, jurorIds: string[]) {
  return prisma.appealVote.createMany({
    data: jurorIds.map((moderatorId) => ({
      appealId,
      moderatorId,
      vote: null,
      reason: null,
    })),
    skipDuplicates: true,
  });
}

// ── getAppeals ──────────────────────────────────────────────────────────────

export async function listPendingAppeals(limit: number, offset: number) {
  const whereClause = { status: 'PENDING' as const };
  return Promise.all([
    prisma.appeal.findMany({
      where: whereClause,
      include: {
        user: { select: APPEAL_USER_SELECT },
        votes: {
          include: { moderator: { select: APPEAL_USER_SELECT } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip: offset,
    }),
    prisma.appeal.count({ where: whereClause }),
  ]);
}

export async function listActiveBansForUsers(userIds: string[]) {
  if (userIds.length === 0) return [];
  return prisma.userBan.findMany({
    where: { userId: { in: userIds }, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
}

// ── resolveAppeal ───────────────────────────────────────────────────────────

export async function findAppealWithUser(appealId: string) {
  return prisma.appeal.findUnique({
    where: { id: appealId },
    include: { user: true },
  });
}

/** Ordered jury vote rows, used for the juror lookup before casting. */
export async function listAppealVotes(appealId: string) {
  return prisma.appealVote.findMany({
    where: { appealId },
    orderBy: { createdAt: 'asc' },
  });
}

/** Post-cast re-count; order is irrelevant, matching the legacy query. */
export async function recountAppealVotes(appealId: string) {
  return prisma.appealVote.findMany({ where: { appealId } });
}

export async function castAppealVote(voteId: string, vote: AppealVoteDecision, reason: string | null) {
  return prisma.appealVote.update({
    where: { id: voteId },
    data: { vote, reason },
  });
}

export interface FinalizeAppealParams {
  appealId: string;
  appealUserId: string | null;
  approved: boolean;
  response: string | undefined;
  moderatorId: string;
}

/**
 * Marks the appeal resolved and applies ban/suspend consequences in one
 * transaction: approval lifts every active ban and restores the account to
 * ACTIVE only when no active ban remains.
 */
export async function finalizeAppealResolution(params: FinalizeAppealParams): Promise<void> {
  const { appealId, appealUserId, approved, response, moderatorId } = params;
  const newStatus = approved ? 'APPROVED' : 'REJECTED';
  const responseValue = response ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.appeal.update({
      where: { id: appealId },
      data: { status: newStatus, moderatorId, response: responseValue, resolvedAt: new Date() },
    });

    if (approved && appealUserId) {
      await tx.userBan.updateMany({ where: { userId: appealUserId, isActive: true }, data: { isActive: false } });
      const remainingBans = await tx.userBan.count({ where: { userId: appealUserId, isActive: true } });
      if (remainingBans === 0) {
        await tx.user.update({ where: { id: appealUserId }, data: { status: 'ACTIVE' } });
      }
    }
  });
}

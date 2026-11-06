import { prisma } from '@/lib/infrastructure/prisma';

export async function createBounty(threadId: string, userId: string, amount: number) {
  return prisma.bounty.create({ data: { threadId, userId, amount } });
}

export async function listBounties(threadId: string) {
  return prisma.bounty.findMany({ where: { threadId }, orderBy: { createdAt: 'desc' } });
}

export async function totalBounty(threadId: string) {
  const agg = await prisma.bounty.aggregate({ where: { threadId, isClaimed: false }, _sum: { amount: true } });
  return agg._sum.amount ?? 0;
}

/**
 * Claim every unclaimed bounty on a thread in one atomic update. The thread
 * creator is the only caller allowed by the route; `isClaimed` is the payout
 * marker and `totalBounty` stops counting claimed rows.
 */
export async function claimBounties(threadId: string) {
  const claimed = await prisma.bounty.updateManyAndReturn({
    where: { threadId, isClaimed: false },
    data: { isClaimed: true },
    select: { amount: true },
  });

  return {
    count: claimed.length,
    amount: claimed.reduce((sum, bounty) => sum + bounty.amount, 0),
  };
}

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

export async function claimBounty(bountyId: string) {
  return prisma.bounty.update({ where: { id: bountyId }, data: { isClaimed: true } });
}

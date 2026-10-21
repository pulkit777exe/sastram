import { prisma } from '@/lib/infrastructure/prisma';

const userPreview = { select: { id: true, name: true, image: true } };

export async function addReaction(messageId: string, userId: string, emoji: string) {
  // Keep the denormalized message.likeCount in step — listings read the
  // column, and nothing else maintains it (counter-reconciliation only
  // repairs drift after the fact).
  const [reaction] = await prisma.$transaction([
    prisma.reaction.create({
      data: { messageId, userId, emoji },
      include: { user: userPreview },
    }),
    prisma.message.update({
      where: { id: messageId },
      data: { likeCount: { increment: 1 } },
    }),
  ]);
  return reaction;
}

export async function removeReaction(messageId: string, userId: string, emoji: string) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.reaction.deleteMany({
      where: { messageId, userId, emoji },
    });

    // Two concurrent "remove" calls can both observe the same reaction before
    // either deletes it. Only the transaction that actually removed a row may
    // decrement the denormalized counter, otherwise likeCount goes negative.
    if (result.count === 0) return result;

    await tx.message.update({
      where: { id: messageId },
      data: { likeCount: { decrement: 1 } },
    });

    return result;
  });
}

export async function getUserReaction(messageId: string, userId: string, emoji: string) {
  return prisma.reaction.findFirst({
    where: { messageId, userId, emoji },
  });
}

import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { randomUUID } from 'crypto';

export type ThreadReadReceipt = {
  readAt: Date;
  lastReadMessageId: string | null;
};

export async function getThreadReadReceipt(
  threadId: string,
  userId: string
): Promise<ThreadReadReceipt | null> {
  try {
    const rows = await prisma.$queryRaw<ThreadReadReceipt[]>`
      SELECT "readAt", "lastReadMessageId"
      FROM "read_receipts"
      WHERE "threadId" = ${threadId} AND "userId" = ${userId}
      LIMIT 1
    `;

    return rows[0] ?? null;
  } catch (error) {
    logger.error('[getThreadReadReceipt]', error);
    return null;
  }
}

// Raw ON CONFLICT rather than prisma.upsert: marking-as-read fires from several
// tabs at once, and a read/write upsert would race on the (threadId, userId) index.
// Failures are logged and swallowed — a lost read receipt isn't worth failing a request.
export async function upsertThreadReadReceipt(params: {
  threadId: string;
  userId: string;
  lastReadMessageId?: string | null;
}): Promise<void> {
  const receiptId = randomUUID();
  try {
    await prisma.$executeRaw`
      INSERT INTO "read_receipts"
        ("id", "threadId", "userId", "lastReadMessageId", "readAt", "createdAt", "updatedAt")
      VALUES
        (${receiptId}, ${params.threadId}, ${params.userId}, ${params.lastReadMessageId ?? null}, NOW(), NOW(), NOW())
      ON CONFLICT ("threadId", "userId")
      DO UPDATE SET
        "lastReadMessageId" = EXCLUDED."lastReadMessageId",
        "readAt" = NOW(),
        "updatedAt" = NOW()
    `;
  } catch (error) {
    logger.error('[upsertThreadReadReceipt]', error);
  }
}

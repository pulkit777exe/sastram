import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { randomUUID } from 'crypto';

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

export interface ThreadUnreadState {
  unreadCount: number;
  firstUnreadMessageId: string | null;
  lastReadMessageId: string | null;
}

type UnreadWhere = {
  threadId: string;
  deletedAt: null;
  senderId?: { not: string };
  OR?: Array<
    | { createdAt: { gt: Date } }
    | { createdAt: Date; id: { gt: string } }
  >;
};

/**
 * Server-authoritative unread state for a user in a thread.
 * Unread = non-deleted messages after the read receipt marker, excluding the user's own messages.
 * If there is no valid marker, counts from the beginning of the thread.
 */
export async function getThreadUnreadState(
  threadId: string,
  userId: string
): Promise<ThreadUnreadState> {
  try {
    const receipt = await prisma.readReceipt.findUnique({
      where: { threadId_userId: { threadId, userId } },
      select: { lastReadMessageId: true },
    });

    let marker: { createdAt: Date; id: string } | null = null;
    if (receipt?.lastReadMessageId) {
      marker = await prisma.message.findFirst({
        where: {
          id: receipt.lastReadMessageId,
          threadId,
          deletedAt: null,
        },
        select: { id: true, createdAt: true },
      });
    }

    const where: UnreadWhere = {
      threadId,
      deletedAt: null,
      senderId: { not: userId },
    };

    if (marker) {
      where.OR = [
        { createdAt: { gt: marker.createdAt } },
        { createdAt: marker.createdAt, id: { gt: marker.id } },
      ];
    }

    const [unreadCount, firstUnread] = await Promise.all([
      prisma.message.count({ where }),
      prisma.message.findFirst({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      }),
    ]);

    return {
      unreadCount,
      firstUnreadMessageId: firstUnread?.id ?? null,
      lastReadMessageId: marker?.id ?? receipt?.lastReadMessageId ?? null,
    };
  } catch (error) {
    logger.error('[getThreadUnreadState]', error);
    return { unreadCount: 0, firstUnreadMessageId: null, lastReadMessageId: null };
  }
}

import { prisma } from '@/lib/infrastructure/prisma';
import { MessageService } from '@/modules/messages/message-service';

const messageService = new MessageService();

const RECENT_HISTORY_SIZE = 10;

export async function moderateIncomingMessage(args: {
  threadId: string;
  authorId: string;
  content: string;
  parentId: string | null;
  attachments?: { name?: string | null; url: string; type: string; size?: number | null }[];
  poll?: { question: string; options: string[]; expiresAt?: string | null } | null;
}) {
  const [recentHistory, thread] = await Promise.all([
    prisma.message.findMany({
      where: { threadId: args.threadId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: RECENT_HISTORY_SIZE,
      select: { id: true, content: true, senderId: true, createdAt: true },
    }),
    prisma.thread.findFirst({
      where: { id: args.threadId, deletedAt: null },
      select: { id: true, name: true, slug: true, visibility: true, createdBy: true },
    }),
  ]);

  const result = await messageService.processMessage(
    {
      // Empty id: the service assigns one when it persists the message.
      id: '',
      content: args.content,
      authorId: args.authorId,
      threadId: args.threadId,
      parentId: args.parentId,
      timestamp: new Date(),
      metadata: { edited: false },
      attachments: args.attachments,
      poll: args.poll,
    },
    {
      threadId: args.threadId,
      participantIds: [args.authorId],
      recentHistory,
      threadMetadata: {
        visibility: thread?.visibility,
        name: thread?.name,
        slug: thread?.slug,
        createdBy: thread?.createdBy,
      },
      relationships: new Map(),
    }
  );

  if (result.message && thread?.slug) {
    result.message.thread = { id: thread.id, name: thread.name, slug: thread.slug };
  }

  return result;
}

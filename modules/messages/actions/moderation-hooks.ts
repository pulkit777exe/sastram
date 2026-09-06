import { prisma } from '@/lib/infrastructure/prisma';
import { MessageService } from '@/modules/messages/moderation-processor';

const messageService = new MessageService();

const RECENT_HISTORY_SIZE = 10;

export async function moderateIncomingMessage(args: {
  threadId: string;
  authorId: string;
  content: string;
  parentId: string | null;
  attachments?: { name?: string | null; url: string; type: string; size?: number | null }[];
  poll?: { question: string; options: string[]; expiresAt?: string | Date | null } | null;
}) {
  const recentHistory = await prisma.message.findMany({
    where: { threadId: args.threadId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: RECENT_HISTORY_SIZE,
    select: { id: true, content: true, senderId: true, createdAt: true },
  });

  const thread = await prisma.thread.findFirst({
    where: { id: args.threadId, deletedAt: null },
    select: { id: true, name: true, slug: true, visibility: true, createdBy: true },
  });

  const messageLike = {
    id: '',
    content: args.content,
    authorId: args.authorId,
    threadId: args.threadId,
    parentId: args.parentId,
    timestamp: new Date(),
    metadata: { edited: false },
    attachments: args.attachments,
    poll: args.poll,
  };

  const context = {
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
  };

  const result = await messageService.processMessage(messageLike, context);

  if (result.message) {
    if (thread && thread.slug) {
      result.message.thread = { id: thread.id, name: thread.name, slug: thread.slug };
    }
  }

  return result;
}

import { prisma } from '@/lib/infrastructure/prisma';
import { MessageService } from '@/lib/services/moderation';

const messageService = new MessageService();

export async function moderateIncomingMessage(args: {
  threadId: string;
  authorId: string;
  content: string;
  parentId: string | null;
}) {
  const recentMessages = await prisma.message.findMany({
    where: { threadId: args.threadId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      content: true,
      senderId: true,
      createdAt: true,
    },
  });

  const thread = await prisma.thread.findFirst({
    where: { id: args.threadId, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      visibility: true,
      createdBy: true,
    },
  });

  const context = {
    threadId: args.threadId,
    participantIds: [args.authorId],
    recentHistory: recentMessages,
    threadMetadata: {
      visibility: thread?.visibility,
      name: thread?.name,
      slug: thread?.slug,
      createdBy: thread?.createdBy,
    },
    relationships: new Map(),
  };

  const result = await messageService.processMessage(
    {
      id: '',
      content: args.content,
      authorId: args.authorId,
      threadId: args.threadId,
      parentId: args.parentId,
      timestamp: new Date(),
      metadata: { edited: false },
    },
    context
  );

  // Attach thread slug to the result
  if (result.message && thread?.slug) {
    result.message.thread = {
      id: thread.id,
      name: thread.name,
      slug: thread.slug,
    };
  }

  return result;
}

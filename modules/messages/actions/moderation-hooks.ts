import { prisma } from '@/lib/infrastructure/prisma';
import { MessageService } from '@/lib/services/moderation';

export async function moderateIncomingMessage(args: {
  threadId: string;
  authorId: string;
  content: string;
  parentId: string | null;
}) {
  const messageService = new MessageService();

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

  const thread = await prisma.thread.findUnique({
    where: { id: args.threadId },
    select: {
      id: true,
      name: true,
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
      createdBy: thread?.createdBy,
    },
    relationships: new Map(),
  };

  return messageService.processMessage(
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
}

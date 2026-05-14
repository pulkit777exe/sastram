import { prisma } from '@/lib/infrastructure/prisma';
import { MessageService } from '@/lib/services/moderation';

export async function moderateIncomingMessage(args: {
  sectionId: string;
  authorId: string;
  content: string;
  parentId: string | null;
}) {
  const messageService = new MessageService();

  const recentMessages = await prisma.message.findMany({
    where: { sectionId: args.sectionId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      content: true,
      senderId: true,
      createdAt: true,
    },
  });

  const section = await prisma.section.findUnique({
    where: { id: args.sectionId },
    select: {
      id: true,
      name: true,
      visibility: true,
      createdBy: true,
    },
  });

  const context = {
    sectionId: args.sectionId,
    participantIds: [args.authorId],
    recentHistory: recentMessages,
    sectionMetadata: {
      visibility: section?.visibility,
      name: section?.name,
      createdBy: section?.createdBy,
    },
    relationships: new Map(),
  };

  return messageService.processMessage(
    {
      id: '',
      content: args.content,
      authorId: args.authorId,
      sectionId: args.sectionId,
      parentId: args.parentId,
      timestamp: new Date(),
      metadata: { edited: false },
    },
    context
  );
}

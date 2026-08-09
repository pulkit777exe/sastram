import type { UserStatus } from '@prisma/client';
import type { ThreadDetail, ThreadDNA, ThreadRecord, ThreadSummary } from './types';

const ANONYMOUS_SENDER = { name: null, image: null, status: 'ACTIVE' as UserStatus };

export function buildThreadDTO(
  thread: ThreadRecord,
  messageCount: number,
  activeUsers: number
): ThreadSummary {
  return {
    id: thread.id,
    slug: thread.slug,
    name: thread.name,
    description: thread.description,
    visibility: thread.visibility,
    messageCount,
    activeUsers,
    latestMessage: null,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    createdBy: thread.createdBy ?? '',
  };
}

export function buildThreadDetailDTO(
  thread: ThreadRecord,
  messageCount: number,
  activeUsers: number,
  summary?: string | null,
  subscriptionCount?: number
): ThreadDetail {
  return {
    ...buildThreadDTO(thread, messageCount, activeUsers),
    aiSummary: summary ?? thread.aiSummary ?? null,
    resolutionScore: thread.resolutionScore,
    threadDna: (thread.threadDna as ThreadDNA | null) ?? undefined,
    lastVerifiedAt: thread.lastVerifiedAt,
    isOutdated: thread.isOutdated,
    subscriptionCount,
    messages:
      thread.messages?.map((message) => ({
        id: message.id,
        content: message.content,
        senderId: message.senderId,
        threadId: message.threadId,
        parentId: message.parentId,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
        deletedAt: message.deletedAt,
        depth: message.depth,
        isEdited: message.isEdited,
        isPinned: message.isPinned,
        likeCount: message.likeCount,
        replyCount: message.replyCount,
        isAiResponse: message.isAiResponse,
        // senderId goes null when the account is deleted (onDelete: SetNull)
        sender: message.sender
          ? {
              id: message.sender.id,
              name: message.sender.name,
              image: message.sender.image,
              status: message.sender.status ?? 'ACTIVE',
            }
          : { id: message.senderId ?? '', ...ANONYMOUS_SENDER },
        attachments:
          message.attachments?.map((att) => ({
            id: att.id,
            url: att.url,
            type: att.type,
            name: att.name,
            size: att.size,
          })) ?? [],
      })) ?? [],
  };
}

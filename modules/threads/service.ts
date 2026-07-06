import { type Community, type UserStatus } from '@prisma/client';
import type {
  ThreadDetail,
  ThreadRecord,
  ThreadSummary,
  ThreadDNA,
} from './types';
import type { CommunitySummary } from '@/modules/communities/types';

export function buildThreadDTO(
  thread: ThreadRecord,
  messageCount: number,
  activeUsers: number,
  memberCount: number
): ThreadSummary {
  return {
    id: thread.id,
    slug: thread.slug,
    name: thread.name,
    description: thread.description,
    visibility: thread.visibility,
    community: thread.community
      ? {
          id: thread.community.id,
          slug: thread.community.slug,
          title: thread.community.title,
        }
      : null,
    messageCount,
    memberCount,
    activeUsers,
    latestMessage: null,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    createdBy: thread.createdBy,
  };
}

export function buildThreadDetailDTO(
  thread: ThreadRecord,
  messageCount: number,
  activeUsers: number,
  memberCount: number,
  summary?: string | null,
  subscriptionCount?: number
): ThreadDetail {
  return {
    ...buildThreadDTO(thread, messageCount, activeUsers, memberCount),
    aiSummary: summary ?? thread.aiSummary ?? null,
    resolutionScore: thread.resolutionScore,
    threadDna: thread.threadDna ? (thread.threadDna as unknown as ThreadDNA) : undefined,
    lastVerifiedAt: thread.lastVerifiedAt,
    isOutdated: thread.isOutdated,
    subscriptionCount,
    messages:
      thread.messages?.map((message) => ({
        id: message.id,
        content: message.content,
        senderId: message.senderId,
        sectionId: message.sectionId,
        parentId: message.parentId ?? null,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
        deletedAt: message.deletedAt ?? null,
        depth: message.depth ?? 0,
        isEdited: message.isEdited ?? false,
        isPinned: message.isPinned ?? false,
        likeCount: message.likeCount ?? 0,
        replyCount: message.replyCount ?? 0,
        isAiResponse: message.isAiResponse ?? false,
        sender: message.sender
          ? {
              id: message.sender.id,
              name: message.sender.name,
              image: message.sender.image,
              status: (message.sender.status as UserStatus) || 'ACTIVE',
            }
          : {
              id: message.senderId,
              name: null,
              image: null,
              status: 'ACTIVE' as UserStatus,
            },
        attachments:
          message.attachments?.map((att) => ({
            id: att.id,
            url: att.url,
            type: att.type,
            name: att.name ?? null,
            size: att.size ?? null,
          })) ?? [],
      })) ?? [],
  };
}

export function buildCommunityDTO(community: Community, threadCount: number): CommunitySummary {
  return {
    id: community.id,
    slug: community.slug,
    title: community.title,
    description: community.description,
    visibility: community.visibility,
    threadCount,
    createdAt: community.createdAt,
  };
}

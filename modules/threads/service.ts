import { type Community, type Message, type UserStatus, type Attachment, type AttachmentType } from '@prisma/client';
import type {
  ThreadDetail,
  ThreadRecord,
  ThreadSummary,
  CommunitySummary,
  ThreadDNA,
  AttachmentInfo,
} from './types';

function formatAttachmentSize(size: bigint | null): string | null {
  if (size === null) return null;
  const bytes = Number(size);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mapAttachment(att: Attachment): AttachmentInfo {
  return {
    id: att.id,
    url: att.url,
    type: att.type as string,
    name: att.name ?? null,
    mimeType: null,
    size: att.size != null ? Number(att.size) : null,
  };
}

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
  subscriptionCount?: number
): ThreadDetail {
  return {
    ...buildThreadDTO(thread, messageCount, activeUsers, memberCount),
    aiSummary: thread.aiSummary ?? null,
    resolutionScore: thread.resolutionScore,
    threadDna: thread.threadDna ? (thread.threadDna as unknown as ThreadDNA) : undefined,
    lastVerifiedAt: thread.lastVerifiedAt,
    isOutdated: thread.isOutdated,
    subscriptionCount,
    messages:
      thread.messages?.map((message) => {
        const msg = message as Message & {
          sender?: { id: string; name: string | null; image: string | null; status: UserStatus } | null;
          attachments?: Attachment[];
        };
        return {
          id: msg.id,
          content: msg.content,
          threadId: msg.threadId,
          senderId: msg.senderId,
          parentId: msg.parentId ?? null,
          senderName: msg.sender?.name || 'Anonymous',
          senderImage: msg.sender?.image,
          createdAt: msg.createdAt,
          updatedAt: msg.updatedAt,
          deletedAt: msg.deletedAt ?? null,
          depth: msg.depth ?? 0,
          isEdited: msg.isEdited ?? false,
          isPinned: msg.isPinned ?? false,
          likeCount: msg.likeCount ?? 0,
          replyCount: msg.replyCount ?? 0,
          isAiResponse: msg.isAiResponse ?? false,
          sender: msg.sender
            ? {
                id: msg.sender.id,
                name: msg.sender.name,
                image: msg.sender.image,
                status: msg.sender.status || ('ACTIVE' as UserStatus),
              }
            : {
                id: msg.senderId,
                name: null,
                image: null,
                status: 'ACTIVE' as UserStatus,
              },
          attachments: msg.attachments?.map(mapAttachment) ?? [],
        };
      }) ?? [],
  };
}

export function buildCommunityDTO(community: Community, threadCount: number, memberCount: number | null = null): CommunitySummary {
  return {
    id: community.id,
    slug: community.slug,
    title: community.title,
    description: community.description,
    visibility: community.visibility,
    threadCount,
    memberCount,
    createdAt: community.createdAt,
  };
}

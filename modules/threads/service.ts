import { randomUUID } from "crypto";
import type { Community, UserStatus } from "@prisma/client";
import type {
  ThreadDetail,
  ThreadRecord,
  ThreadSummary,
  CommunitySummary,
  ThreadDNA,
} from "./types";

export function slugifyTitle(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildThreadSlug(title: string, existingId?: string) {
  const base = slugifyTitle(title);
  const suffix = existingId ?? randomUUID();
  return `${base}-${suffix}`;
}

export function buildThreadDTO(
  thread: ThreadRecord,
  messageCount: number,
  activeUsers: number,
  memberCount: number,
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
  subscriptionCount?: number,
): ThreadDetail {
  return {
    ...buildThreadDTO(thread, messageCount, activeUsers, memberCount),
    summary:
      summary ??
      ((thread as Record<string, unknown>).aiSummary as string) ??
      null,
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
        parentId: message.parentId ?? null,
        senderName:
          message.sender?.name || message.sender?.email || "Anonymous",
        senderAvatar: message.sender?.image,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
        deletedAt: message.deletedAt ?? null,
        depth: message.depth ?? 0,
        isEdited: message.isEdited ?? false,
        isPinned: message.isPinned ?? false,
        likeCount:
          ((message as Record<string, unknown>).likeCount as number) ?? 0,
        replyCount:
          ((message as Record<string, unknown>).replyCount as number) ?? 0,
        isAiResponse:
          ((message as Record<string, unknown>).isAiResponse as boolean) ??
          false,
        sender: message.sender
          ? {
              id: message.sender.id,
              name: message.sender.name,
              avatarUrl: message.sender.image,
              status: (message.sender.status as UserStatus) || "ACTIVE",
            }
          : {
              id: message.senderId,
              name: null,
              avatarUrl: null,
              status: "ACTIVE" as UserStatus,
            },
        attachments:
          ((message as Record<string, unknown>).attachments as Array<{
            id: string;
            url: string;
            type: string;
            name?: string | null;
            size?: string | null;
          }>) ?? [],
      })) ?? [],
  };
}

export function buildCommunityDTO(
  community: Community,
  threadCount: number,
): CommunitySummary {
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

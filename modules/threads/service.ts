import { randomUUID } from "crypto";
import type { Community, UserStatus } from "@prisma/client";
import type {
  ThreadDetail,
  ThreadRecord,
  ThreadSummary,
  CommunitySummary,
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
): ThreadSummary {
  return {
    id: thread.id,
    slug: thread.slug,
    name: thread.name,
    description: thread.description,
    icon: thread.icon,
    visibility: thread.visibility,
    community: thread.community
      ? {
          id: thread.community.id,
          slug: thread.community.slug,
          title: thread.community.title,
        }
      : null,
    messageCount,
    memberCount: thread.memberCount || 0,
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
  summary?: string | null,
  subscriptionCount?: number,
): ThreadDetail {
  return {
    ...buildThreadDTO(thread, messageCount, activeUsers),
    summary: summary ?? thread.summary,
    subscriptionCount,
    messages:
      thread.messages?.map((message) => ({
        id: message.id,
        content: message.content,
        senderId: message.senderId,
        senderName:
          message.sender?.name || message.sender?.email || "Anonymous",
        senderAvatar: message.sender?.image,
        createdAt: message.createdAt,
        depth: message.depth ?? 0,
        isEdited: message.isEdited ?? false,
        isPinned: message.isPinned ?? false,
        updatedAt: message.updatedAt,
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

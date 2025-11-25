import { randomUUID } from "crypto";
import type { Community } from "@prisma/client";
import type { ThreadDetail, ThreadRecord, ThreadSummary, CommunitySummary } from "./types";

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
    title: thread.name,
    description: thread.description,
    community: thread.community
      ? {
          id: thread.community.id,
          slug: thread.community.slug,
          title: thread.community.title,
        }
      : null,
    messageCount,
    activeUsers,
    icon: thread.icon,
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
        senderName: message.sender?.name || message.sender?.email || "Anonymous",
        senderAvatar: message.sender?.image,
        createdAt: message.createdAt,
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
    threadCount,
  };
}


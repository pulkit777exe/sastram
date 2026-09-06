import type { UserStatus } from '@prisma/client';
import type { Message } from '@/lib/types/index';
import type { ThreadDetail, ThreadDNA, ThreadRecord, ThreadSummary } from './types';
import type { ThreadMessage as ReadThreadMessage } from './threads-read/repository';

export type ThreadMessage = ReadThreadMessage;

const ANONYMOUS_NAME = 'Anonymous';
const ANONYMOUS_STATUS: UserStatus = 'ACTIVE';

function mapAttachment(att: { id: string; url: string; type: string; name: string | null; size: number | null }): {
  id: string;
  name: string | null;
  url: string;
  type: string;
  size: number | null;
} {
  return {
    id: att.id,
    name: att.name ?? null,
    url: att.url,
    type: att.type,
    size: att.size ?? null,
  };
}

function resolveClientSender(message: ReadThreadMessage): { id: string; name: string; image: string | null } {
  if (message.author) {
    return {
      id: message.author.id,
      name: message.author.name ?? ANONYMOUS_NAME,
      image: message.author.image ?? null,
    };
  }
  return { id: message.senderId ?? '', name: ANONYMOUS_NAME, image: null };
}

/**
 * The read models speak SQL-shaped names (`body`, `isAI`, `author`); the UI
 * speaks `Message` (`content`, `isAiResponse`, `sender`). Reconcile once here
 * so callers never hand-roll the mapping.
 */
export function toClientMessage(
  message: ReadThreadMessage,
  thread: { id: string; name: string; slug: string }
): Message {
  const sender = resolveClientSender(message);
  const attachments = (message.attachments ?? []).map(mapAttachment);
  return {
    id: message.id,
    content: message.content,
    threadId: thread.id,
    senderId: message.senderId,
    parentId: message.parentId,
    depth: message.depth,
    isEdited: message.isEdited,
    isPinned: message.isPinned,
    likeCount: message.likeCount,
    replyCount: message.replyCount,
    isAiResponse: message.isAI,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    deletedAt: message.deletedAt,
    sender,
    thread,
    attachments,
  };
}

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

function mapDetailAttachment(att: { id: string; url: string; type: string; name?: string | null; size?: unknown }): {
  id: string;
  url: string;
  type: string;
  name: string | null | undefined;
  size: bigint | string | null | undefined;
} {
  return {
    id: att.id,
    url: att.url,
    type: att.type,
    name: att.name,
    size: att.size as bigint | string | null | undefined,
  };
}

function toDetailSender(message: {
  senderId: string | null;
  sender?: { id: string; name: string | null; image: string | null; status?: UserStatus | null } | null;
}): { id: string; name: string | null; image: string | null; status: UserStatus } {
  if (message.sender) {
    return {
      id: message.sender.id,
      name: message.sender.name,
      image: message.sender.image,
      status: message.sender.status ?? ANONYMOUS_STATUS,
    };
  }
  return {
    id: message.senderId ?? '',
    name: null,
    image: null,
    status: ANONYMOUS_STATUS,
  };
}

function resolveAiSummary(
  summary: string | null | undefined,
  threadSummary: string | null | undefined
): string | null {
  if (summary !== undefined && summary !== null) return summary;
  if (threadSummary !== undefined && threadSummary !== null) return threadSummary;
  return null;
}

function mapDetailMessage(
  message: NonNullable<ThreadRecord['messages']>[number]
): ThreadDetail['messages'][number] {
  return {
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
    sender: toDetailSender(message),
    attachments: (message.attachments ?? []).map(mapDetailAttachment),
  };
}

export function buildThreadDetailDTO(
  thread: ThreadRecord,
  messageCount: number,
  activeUsers: number,
  summary?: string | null,
  subscriptionCount?: number
): ThreadDetail {
  const base = buildThreadDTO(thread, messageCount, activeUsers);
  const aiSummaryValue = resolveAiSummary(summary, thread.aiSummary ?? null);
  const threadDnaValue = thread.threadDna ? (thread.threadDna as ThreadDNA) : undefined;
  const messages = (thread.messages ?? []).map(mapDetailMessage);
  return {
    ...base,
    aiSummary: aiSummaryValue,
    resolutionScore: thread.resolutionScore,
    threadDna: threadDnaValue,
    lastVerifiedAt: thread.lastVerifiedAt,
    isOutdated: thread.isOutdated,
    subscriptionCount,
    messages,
  };
}

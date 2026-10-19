import { prisma } from '@/lib/infrastructure/prisma';
import type { ThreadRecord } from '@/modules/threads/types';
import type { ThreadVisibility } from '@prisma/client';
import { threadDnaSchema } from '@/lib/schemas/thread-dna';

export interface CreateThreadResult {
  thread: ThreadRecord;
  messageCount: number;
  initialMessage?: { id: string; content: string; createdAt: Date };
}

export async function createThread(payload: {
  name: string;
  description?: string | null;
  slug: string;
  createdBy: string;
  initialMessage?: string;
  visibility?: ThreadVisibility;
}): Promise<CreateThreadResult> {
  const hasInitialMessage = Boolean(payload.initialMessage);
  const thread = await prisma.thread.create({
    data: {
      name: payload.name,
      description: payload.description,
      slug: payload.slug,
      createdBy: payload.createdBy,
      visibility: payload.visibility ?? 'PUBLIC',
      messageCount: hasInitialMessage ? 1 : 0,
      messages: hasInitialMessage
        ? { create: { content: payload.initialMessage!, senderId: payload.createdBy } }
        : undefined,
    },
    include: {
      messages: true,
    },
  });

  const record = thread as ThreadRecord;

  let initialMessage: CreateThreadResult['initialMessage'] = undefined;
  if (payload.initialMessage && thread.messages[0]) {
    initialMessage = {
      id: thread.messages[0].id,
      content: payload.initialMessage,
      createdAt: thread.messages[0].createdAt,
    };
  }

  return {
    thread: record,
    messageCount: thread.messageCount,
    initialMessage,
  };
}

// Soft-delete only. The purge cron (app/api/cron/update-threads) hard-removes the
// row plus cascade once deletedAt is past the retention window.
export async function deleteThread(threadId: string): Promise<void> {
  await prisma.thread.update({
    where: { id: threadId },
    data: { deletedAt: new Date() },
  });
}

export async function updateThreadDNA(
  threadId: string,
  threadDNA: Record<string, unknown>
): Promise<void> {
  await prisma.thread.update({
    where: { id: threadId },
    data: { threadDna: threadDnaSchema.parse(threadDNA) },
  });
}

// Human verification clears staleness and stamps verifiedAt/verifiedBy.
// lastVerifiedAt is deliberately NOT touched: it is reserved for AI score
// computations, and the trust gate prefers verifiedAt when both exist.
export async function updateThreadVerified(threadId: string, userId: string): Promise<void> {
  await prisma.thread.update({
    where: { id: threadId },
    data: { verifiedAt: new Date(), verifiedBy: userId, isOutdated: false },
  });
}

/** Rename a thread / edit its description. Slug is intentionally untouched. Returns the stable slug for revalidation. */
export async function updateThreadDetails(
  threadId: string,
  data: { name: string; description: string | null }
): Promise<{ slug: string }> {
  const updated = await prisma.thread.update({
    where: { id: threadId },
    data: { name: data.name, description: data.description },
    select: { slug: true },
  });
  return { slug: updated.slug };
}

export async function forkThread(payload: { name: string; description?: string | null; slug: string; createdBy: string; forkedFromId: string; visibility?: ThreadVisibility }) {
  const forked = await prisma.thread.create({
    data: {
      name: payload.name,
      description: payload.description,
      slug: payload.slug,
      createdBy: payload.createdBy,
      forkedFromId: payload.forkedFromId,
      visibility: payload.visibility ?? 'PUBLIC',
    },
  });
  // Tag copy lives in threads-write/service.ts forkThreadDomain via
  // ThreadSideEffectsPort.copyThreadTags (keeps this repository thin).
  return forked;
}

import { prisma } from '@/lib/infrastructure/prisma';
import { rateLimit } from '@/lib/services/rate-limit';

export async function applyModerationRateLimit(userId: string) {
  let result;
  try {
    result = await rateLimit({ key: userId, type: 'api' });
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('Rate limit exceeded. Please slow down.');
  }

  if (!result.success) {
    throw new Error('Rate limit exceeded. Please slow down.');
  }
}

export async function validateModerationTarget(targetUserId: string, moderatorId: string) {
  if (targetUserId === moderatorId) {
    throw new Error('Cannot perform moderation actions on yourself');
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId, deletedAt: null },
    select: { id: true, role: true, status: true, name: true, email: true },
  });

  if (!targetUser) {
    throw new Error('Target user not found');
  }

  if (targetUser.role === 'ADMIN') {
    throw new Error('Cannot moderate administrator accounts');
  }

  return targetUser;
}

export async function findMessageForDeletion(messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      threadId: true,
      senderId: true,
      thread: { select: { name: true, slug: true } },
    },
  });

  if (!message) {
    throw new Error('message not found');
  }

  return message;
}

export async function findThreadForDeletion(threadId: string) {
  // Exclude soft-deleted threads: deleting an already-deleted thread is a no-op error.
  const thread = await prisma.thread.findFirst({
    where: { id: threadId, deletedAt: null },
    select: { id: true, name: true, slug: true, messageCount: true, memberCount: true },
  });

  if (!thread) {
    throw new Error('section not found');
  }

  return thread;
}

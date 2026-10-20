import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { buildAiReplyFailureContent } from '@/modules/ai-reply/failure';
import { runGuardedWorker, readAlreadyBilled } from './_shared';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import {
  fetchThreadContext,
  createAiReplyMessageTx,
  getOrCreateAiUser,
  streamAiReplyToMessage,
} from '@/modules/ai-reply/service';
import type { AIInlineJobData } from '../types';

async function generateAIInlineResponse(
  messageId: string,
  threadId: string,
  query: string,
) {
  const parentMessage = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, depth: true, threadId: true },
  });

  if (!parentMessage) {
    logger.error('[worker:ai] Parent message not found', { messageId });
    return { queued: false, handled: false, error: 'Parent message not found' };
  }

  let aiMessage: { id: string } | null = null;

  try {
    const existingAiMessage = await prisma.message.findFirst({
      where: { threadId, parentId: parentMessage.id, isAiResponse: true },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    const context = await fetchThreadContext(threadId);

    if (existingAiMessage) {
      logger.info(`[worker:ai] Reusing existing AI message ${existingAiMessage.id} for parent ${messageId} (retry)`);
      aiMessage = existingAiMessage;
    } else {
      const aiUser = await getOrCreateAiUser();
      aiMessage = await createAiReplyMessageTx({
        threadId,
        parentId: parentMessage.id,
        parentDepth: parentMessage.depth,
        aiUserId: aiUser.id,
      });
    }

    // Deep module handles throttled streaming + final sanitize in one place
    await streamAiReplyToMessage({
      query,
      context,
      aiMessageId: aiMessage.id,
    });
  } catch (error) {
    logger.error('[worker:ai] AI inline generation failed:', error);

    const failureMessage = buildAiReplyFailureContent(error);

    if (aiMessage) {
      await prisma.message.update({
        where: { id: aiMessage.id },
        data: { content: failureMessage },
      });
    }
  }

  logger.info('[worker:ai] AI inline job complete');
  return { queued: true, handled: true, aiMessageId: aiMessage?.id };
}

export async function handleAIInlineJob(data: AIInlineJobData) {
  logger.info('[worker:ai] ai-inline job');
  const { messageId, threadId, query } = data;
  if (!messageId || !threadId || !query) {
    throw new Error('Missing required fields: messageId, threadId, query');
  }
  // Routes consume spend before enqueueing; honor the request-scoped
  // idempotency key so the worker skips re-consumption (no double-billing).
  const alreadyBilled = readAlreadyBilled(data);
  const result = await runGuardedWorker(
    'ai-inline',
    AiCallPath.AI_INLINE_REPLY,
    threadId,
    () => generateAIInlineResponse(messageId, threadId, query),
    { alreadyBilled }
  );
  if (!result.ok) {
    return { queued: false, handled: false, skipped: true };
  }
  return result.value;
}

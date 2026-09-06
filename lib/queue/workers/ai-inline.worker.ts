import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { isQuotaError } from '@/lib/utils/errors';
import { assertSpendCapAvailable } from './_shared';
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
    await assertSpendCapAvailable();

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

    const isQuota = isQuotaError(error);
    let isSpendCap = false;
    if (error instanceof Error) {
      isSpendCap = error.message.toLowerCase().includes('spend cap');
    }
    const isCapOrQuota = isQuota || isSpendCap;

    let failureMessage: string;
    if (isCapOrQuota) {
      failureMessage = "I'm temporarily over my AI quota, so I couldn't reply just now. Please try again later.";
    } else {
      failureMessage = "Sorry, I couldn't generate a response right now. Please try again later.";
    }

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
  return generateAIInlineResponse(messageId, threadId, query);
}

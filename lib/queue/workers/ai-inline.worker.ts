import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { aiService } from '@/lib/ai';
import { wrapUserContent, DATA_ONLY_INSTRUCTION } from '@/lib/ai/prompt-boundary';
import { sanitizeUserContent } from '@/lib/services/content-safety';
import { isQuotaError } from '@/lib/utils/errors';
import { assertSpendCapAvailable } from './_shared';
import type { AIInlineJobData } from '../types';

async function fetchThreadContext(threadId: string): Promise<string> {
  const recentMessages = await prisma.message.findMany({
    where: { threadId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      content: true,
      sender: { select: { name: true } },
    },
  });

  return recentMessages
    .reverse()
    .map((m) => `${m.sender?.name || 'User'}: ${m.content}`)
    .join('\n');
}

async function getOrCreateAiUser() {
  return prisma.user.upsert({
    where: { email: 'ai@sastram.system' },
    update: { name: 'Sastram AI', emailVerified: true },
    create: {
      email: 'ai@sastram.system',
      name: 'Sastram AI',
      emailVerified: true,
      role: 'USER',
      status: 'ACTIVE',
    },
    select: { id: true, name: true, image: true },
  });
}

async function createAiMessage(
  threadId: string,
  parentId: string,
  depth: number,
  senderId: string,
) {
  // Create + counter bumps share a transaction so the denormalized counts stay
  // in sync, mirroring what MessageService.processMessage does for user replies.
  return prisma.$transaction(async (tx) => {
    const msg = await tx.message.create({
      data: {
        content: '',
        threadId,
        senderId,
        parentId,
        depth: Math.min(depth, 4),
        isAiResponse: true,
        isEdited: false,
        isPinned: false,
        likeCount: 0,
        replyCount: 0,
      },
      include: {
        thread: { select: { id: true, name: true, slug: true } },
      },
    });

    if (parentId) {
      await tx.message.update({
        where: { id: parentId },
        data: { replyCount: { increment: 1 } },
      });
    }

    await tx.thread.update({
      where: { id: threadId },
      data: { messageCount: { increment: 1 } },
    });

    return msg;
  });
}

// Partial content is flushed to the DB as it streams so a reader polling the
// message sees it grow, rather than waiting for the whole generation.
const DB_THROTTLE_MS = 500;
const MAX_AI_REPLY_CHARS = 2000;

async function streamAiResponse(
  query: string,
  context: string,
  aiMessage: { id: string },
): Promise<void> {
  let fullContent = '';
  let lastDbUpdateTime = Date.now();

  await aiService.generateStreamingResponse(
    `Answer this forum question in under 200 words and stay grounded in thread context.${DATA_ONLY_INSTRUCTION}\nQuestion: ${wrapUserContent(query)}\n\nRecent thread context:\n${wrapUserContent(context)}`,
    async (chunk) => {
      fullContent += chunk;
      const now = Date.now();
      if (now - lastDbUpdateTime >= DB_THROTTLE_MS) {
        await prisma.message.update({
          where: { id: aiMessage.id },
          data: { content: fullContent.slice(0, MAX_AI_REPLY_CHARS) },
        });
        lastDbUpdateTime = now;
      }
    },
  );

  const { sanitized } = sanitizeUserContent(fullContent.slice(0, MAX_AI_REPLY_CHARS));
  await prisma.message.update({
    where: { id: aiMessage.id },
    data: { content: sanitized },
  });
}

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

  // The inline @sai reply is a best-effort, user-facing enhancement. Any failure
  // along the way (spend cap, quota, auth, network) must NOT crash the job or
  // leave a broken empty message — we write a clear placeholder and return 200 so
  // QStash does not retry a failure the user has already seen.
  let aiMessage: { id: string } | null = null;

  try {
    await assertSpendCapAvailable();

    // A previous attempt may have already created the placeholder message;
    // reuse it so a retry doesn't post a second reply.
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
      aiMessage = await createAiMessage(threadId, parentMessage.id, (parentMessage.depth ?? 0) + 1, aiUser.id);
    }

    await streamAiResponse(query, context, aiMessage);
  } catch (error) {
    logger.error('[worker:ai] AI inline generation failed:', error);

    const isCapOrQuota =
      isQuotaError(error) || /spend cap/i.test(error instanceof Error ? error.message : '');

    if (aiMessage) {
      await prisma.message.update({
        where: { id: aiMessage.id },
        data: {
          content: isCapOrQuota
            ? "I'm temporarily over my AI quota, so I couldn't reply just now. Please try again later."
            : "Sorry, I couldn't generate a response right now. Please try again later.",
        },
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

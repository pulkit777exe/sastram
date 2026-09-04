import { prisma } from '@/lib/infrastructure/prisma';
import { aiService, isAiNotConfigured } from '@/lib/ai';
import { wrapUserContent, DATA_ONLY_INSTRUCTION } from '@/lib/ai/prompt-boundary';
import { sanitizeUserContent } from '@/lib/services/content-safety';
import { logger } from '@/lib/infrastructure/logger';

/**
 * AiReply — deep module, one interface behind the seam, two adapters:
 *   - queue adapter: lib/queue/workers/ai-inline.worker.ts
 *   - sse adapter:  app/api/threads/[id]/ai-reply/stream/route.ts
 *
 * Concentrates: fetchThreadContext, getOrCreateAiUser, createAiReplyMessage
 * (denormalized counters), prompt boundary, throttled streaming.
 *
 * Vercel free: uses Upstash REST (no ioredis) via callers' spend cap,
 * Web Streams for SSE, no WebSocket.
 */

const MAX_AI_REPLY_CHARS = 2000;
const DB_THROTTLE_MS = 500;
const MAX_MESSAGE_DEPTH = 4;

export async function fetchThreadContext(threadId: string): Promise<string> {
  const recentMessages = await prisma.message.findMany({
    where: { threadId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: { content: true, sender: { select: { name: true } } },
  });
  const ordered = [...recentMessages].reverse();
  const lines = ordered.map((m) => {
    const senderName = m.sender?.name || 'User';
    return `${senderName}: ${m.content}`;
  });
  return lines.join('\n');
}

export async function getOrCreateAiUser() {
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

/**
 * Atomic: create AI message + bump parent replyCount + bump thread messageCount.
 * Single place to fix depth math, counter sync — locality win.
 * Fetches aiUser outside the transaction so the tx stays short.
 */
export async function createAiReplyMessage(params: {
  threadId: string;
  parentId: string;
  parentDepth: number | null | undefined;
}): Promise<{ id: string }> {
  const { threadId, parentId, parentDepth } = params;
  const aiUser = await getOrCreateAiUser();
  return createAiReplyMessageTx({ threadId, parentId, parentDepth, aiUserId: aiUser.id });
}

/**
 * Transaction variant where aiUserId is already resolved (avoids extra upsert).
 */
export async function createAiReplyMessageTx(params: {
  threadId: string;
  parentId: string;
  parentDepth: number | null | undefined;
  aiUserId: string;
}): Promise<{ id: string }> {
  const { threadId, parentId, parentDepth, aiUserId } = params;
  return prisma.$transaction(async (tx) => {
    const msg = await tx.message.create({
      data: {
        content: '',
        threadId,
        senderId: aiUserId,
        parentId,
        depth: Math.min((parentDepth ?? 0) + 1, MAX_MESSAGE_DEPTH),
        isAiResponse: true,
        isEdited: false,
        isPinned: false,
        likeCount: 0,
        replyCount: 0,
      },
      select: { id: true },
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

export function buildPrompt(query: string, context: string): string {
  return `Answer this forum question in under 200 words and stay grounded in thread context.${DATA_ONLY_INSTRUCTION}\nQuestion: ${wrapUserContent(query)}\n\nRecent thread context:\n${wrapUserContent(context)}`;
}

/**
 * Streams tokens from aiService, throttles DB writes to every 500ms,
 * sanitizes final content, writes once more at end.
 *
 * Two adapters share this:
 *  - worker: onToken is no-op (polling clients see DB grow)
 *  - sse: onToken sends `token` event
 *
 * Returns final sanitized content or fallback if not configured.
 */
export async function streamAiReplyToMessage(params: {
  query: string;
  context: string;
  aiMessageId: string;
  onToken?: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<{ content: string; truncated: boolean; isFallback: boolean }> {
  const { query, context, aiMessageId, onToken, signal } = params;
  let fullContent = '';
  let lastDbUpdateTime = Date.now();
  let closed = false;

  signal?.addEventListener('abort', () => {
    closed = true;
  });

  const prompt = buildPrompt(query, context);

  await aiService.generateStreamingResponse(prompt, async (chunk) => {
    if (closed) return;
    fullContent += chunk;
    if (onToken) onToken(chunk);

    const now = Date.now();
    if (now - lastDbUpdateTime >= DB_THROTTLE_MS && !isAiNotConfigured(fullContent)) {
      lastDbUpdateTime = now;
      const sliced = fullContent.slice(0, MAX_AI_REPLY_CHARS);
      // Fire-and-forget throttled write — don't block token stream
      prisma.message
        .update({ where: { id: aiMessageId }, data: { content: sliced } })
        .catch((err) => logger.error('[ai-reply] throttled DB write failed', { error: err }));
    }
  });

  if (isAiNotConfigured(fullContent)) {
    const fallbackContent = 'AI features are not configured. Please set an API key to enable AI responses.';
    await prisma.message.update({
      where: { id: aiMessageId },
      data: { content: fallbackContent },
    });
    return { content: fallbackContent, truncated: false, isFallback: true };
  }

  const truncated = fullContent.length > MAX_AI_REPLY_CHARS;
  const finalContent = fullContent.slice(0, MAX_AI_REPLY_CHARS);
  const { sanitized } = sanitizeUserContent(finalContent);

  await prisma.message.update({
    where: { id: aiMessageId },
    data: { content: sanitized },
  });

  return { content: sanitized, truncated, isFallback: false };
}

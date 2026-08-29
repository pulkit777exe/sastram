import { prisma } from '@/lib/infrastructure/prisma';
import { NextRequest } from 'next/server';
import { logger } from '@/lib/infrastructure/logger';
import { requireSessionOrThrow } from '@/modules/auth';
import { requireThreadAccessOrThrow } from '@/lib/thread-access';
import { rateLimit } from '@/lib/services/rate-limit';
import { consumeSpendCap } from '@/lib/services/ai-spend-cap';
import { evaluateAiCostGate, AiCallPath } from '@/lib/services/ai-cost-classification';
import { trackNeonRequest } from '@/lib/services/usage-check';
import { extractAiInlineQuery } from '@/modules/messages/actions/ai-inline';
import { z } from 'zod';
import { sseEvent, sseHeaders } from '@/lib/utils/sse';
import {
  fetchThreadContext,
  getOrCreateAiUser,
  createAiReplyMessageTx,
  streamAiReplyToMessage,
} from '@/modules/ai-reply/service';

const TIMEOUT_MS = 50_000;

const paramsSchema = z.object({
  threadId: z.string().cuid(),
});

export async function GET(
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> }
) {
  const encoder = new TextEncoder();

  let session;
  try {
    session = await requireSessionOrThrow();
  } catch {
    return new Response(sseEvent('error', { error: 'Unauthorized' }), {
      status: 401,
      headers: sseHeaders(),
    });
  }

  const threadId = context?.params ? (await context.params).threadId : '';
  const parsedParams = paramsSchema.safeParse({ threadId });
  if (!parsedParams.success) {
    return new Response(sseEvent('error', { error: 'Invalid thread ID' }), {
      status: 400,
      headers: sseHeaders(),
    });
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown';
  const rateLimitResult = await rateLimit({ key: `ai-reply-stream:${session.user.id}:${ip}`, type: 'api' });
  if (!rateLimitResult.success) {
    return new Response(sseEvent('error', { error: 'Too many requests' }), {
      status: 429,
      headers: sseHeaders(),
    });
  }

  try {
    await requireThreadAccessOrThrow(threadId, session.user.id, session.user.role);
  } catch {
    return new Response(sseEvent('error', { error: 'Forbidden' }), {
      status: 403,
      headers: sseHeaders(),
    });
  }

  const requestedMessageId = request.nextUrl.searchParams.get('messageId');
  const parentMessage = requestedMessageId
    ? await prisma.message.findFirst({
        where: { id: requestedMessageId, threadId, deletedAt: null },
      })
    : await prisma.message.findFirst({
        where: {
          threadId,
          OR: [
            { content: { contains: '@sai', mode: 'insensitive' } },
            { content: { contains: '@ai', mode: 'insensitive' } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });

  if (!parentMessage) {
    return new Response(sseEvent('error', { error: 'No @sai mention found' }), {
      status: 400,
      headers: sseHeaders(),
    });
  }

  const query = extractAiInlineQuery(parentMessage.content)
    ?? parentMessage.content.replace(/(?:^|\s)@ai\s+/i, '').trim();
  if (!extractAiInlineQuery(parentMessage.content) && !/(?:^|\s)@ai\s+\S+/i.test(parentMessage.content)) {
    return new Response(sseEvent('error', { error: 'No question found after @sai' }), {
      status: 400,
      headers: sseHeaders(),
    });
  }

  const spendCap = await consumeSpendCap();
  const gate = evaluateAiCostGate({
    path: AiCallPath.AI_REPLY_STREAM,
    spendCapAllowed: spendCap.allowed,
  });
  if (!gate.allowed) {
    return new Response(sseEvent('error', { error: 'AI features temporarily unavailable' }), {
      status: 503,
      headers: sseHeaders(),
    });
  }

  // Deep module — single implementation for context + user + transaction
  const threadContext = await fetchThreadContext(threadId);
  const aiUser = await getOrCreateAiUser();
  const parentMsg = await prisma.message.findUnique({
    where: { id: parentMessage.id },
    select: { depth: true },
  });

  const aiMessage = await createAiReplyMessageTx({
    threadId,
    parentId: parentMessage.id,
    parentDepth: parentMsg?.depth,
    aiUserId: aiUser.id,
  });
  void trackNeonRequest();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        } catch {
          closed = true;
        }
      };

      request.signal.addEventListener('abort', () => {
        closed = true;
        controller.close();
      });

      const timeout = setTimeout(() => {
        if (!closed) {
          send('error', { error: 'Generation timed out' });
          closed = true;
          controller.close();
        }
      }, TIMEOUT_MS);

      send('start', {
        messageId: aiMessage.id,
        parentId: parentMessage.id,
        threadId,
        depth: Math.min((parentMsg?.depth ?? 0) + 1, 4),
        createdAt: new Date().toISOString(),
        senderId: aiUser.id,
        senderName: aiUser.name ?? 'Sastram AI',
        senderImage: aiUser.image ?? null,
      });

      try {
        // Deep module handles prompt, throttled DB writes, sanitize, fallback
        const result = await streamAiReplyToMessage({
          query,
          context: threadContext,
          aiMessageId: aiMessage.id,
          onToken: (chunk) => send('token', { content: chunk }),
          signal: request.signal,
        });

        clearTimeout(timeout);

        if (result.isFallback) {
          send('done', { messageId: aiMessage.id, truncated: false });
          return;
        }

        send('done', { messageId: aiMessage.id, truncated: result.truncated });
      } catch (error) {
        clearTimeout(timeout);
        logger.error('[ai-reply-stream] Generation error', { error });

        // Read partial content from DB fallback — stream helper already wrote sanitized
        // On error, ensure message has some content
        const fallback = await prisma.message.findUnique({
          where: { id: aiMessage.id },
          select: { content: true },
        });
        if (!fallback?.content) {
          await prisma.message.update({
            where: { id: aiMessage.id },
            data: { content: "Sorry, I couldn't generate a response right now. Please try again later." },
          });
        }

        send('error', { error: 'Generation failed', messageId: aiMessage.id });
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: sseHeaders(),
  });
}

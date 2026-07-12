import { prisma } from '@/lib/infrastructure/prisma';
import { NextRequest } from 'next/server';
import { logger } from '@/lib/infrastructure/logger';
import { requireThreadMembershipOrThrow, requireSessionOrThrow } from '@/modules/auth/session';
import { rateLimit } from '@/lib/services/rate-limit';
import { checkAiSpendCap } from '@/lib/services/ai-spend-cap';
import { aiService, isAiNotConfigured } from '@/lib/services/ai';
import { sanitizeUserContent } from '@/lib/services/content-safety';
import { wrapUserContent, DATA_ONLY_INSTRUCTION } from '@/lib/utils/prompt-boundary';
import { emitThreadMessage } from '@/modules/ws';
import { trackNeonRequest } from '@/lib/services/usage-check';
import { z } from 'zod';

const TIMEOUT_MS = 50_000;
const DB_THROTTLE_MS = 500;
const MAX_CONTENT_CHARS = 2000;

const paramsSchema = z.object({
  threadId: z.string().cuid(),
});

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

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
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const threadId = context?.params ? (await context.params).threadId : '';
  const parsedParams = paramsSchema.safeParse({ threadId });
  if (!parsedParams.success) {
    return new Response(sseEvent('error', { error: 'Invalid thread ID' }), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const rateLimitResult = await rateLimit({ key: `ai-reply-stream:${session.user.id}:${ip}`, type: 'api' });
  if (!rateLimitResult.success) {
    return new Response(sseEvent('error', { error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const spendCap = await checkAiSpendCap();
  if (!spendCap.allowed) {
    return new Response(sseEvent('error', { error: 'AI features temporarily unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  try {
    await requireThreadMembershipOrThrow(threadId, session.user.id);
  } catch {
    return new Response(sseEvent('error', { error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const parentMessage = await prisma.message.findFirst({
    where: { threadId, content: { contains: '@ai' } },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });

  if (!parentMessage) {
    return new Response(sseEvent('error', { error: 'No @ai mention found' }), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const query = parentMessage.content.replace(/@ai\s*/gi, '').trim();
  if (!query) {
    return new Response(sseEvent('error', { error: 'No question found after @ai' }), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const recentMessages = await prisma.message.findMany({
    where: { threadId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      content: true,
      sender: { select: { name: true } },
    },
  });
  const threadContext = recentMessages
    .reverse()
    .map((m) => `${m.sender?.name || 'User'}: ${m.content}`)
    .join('\n');

  const aiUser = await prisma.user.upsert({
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

  const parentMsg = await prisma.message.findUnique({
    where: { id: parentMessage.id },
    select: { depth: true },
  });

  const aiMessage = await prisma.message.create({
    data: {
      content: '',
      threadId,
      senderId: aiUser.id,
      parentId: parentMessage.id,
      depth: Math.min((parentMsg?.depth ?? 0) + 1, 4),
      isAiResponse: true,
      isEdited: false,
      isPinned: false,
      likeCount:0,
      replyCount: 0,
    },
    select: { id: true },
  });
  void trackNeonRequest(); // best-effort usage tracking

  const stream = new ReadableStream({
    async start(controller) {
      let fullContent = '';
      let lastDbUpdateTime = Date.now();
      let lastEmitTime = Date.now();
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

      try {
        await aiService.generateStreamingResponse(
          `Answer this forum question in under 200 words and stay grounded in thread context.${DATA_ONLY_INSTRUCTION}\nQuestion: ${wrapUserContent(query)}\n\nRecent thread context:\n${wrapUserContent(threadContext)}`,
          async (chunk) => {
            if (closed) return;
            fullContent += chunk;
            send('token', { content: chunk });

            const now = Date.now();
            if (now - lastDbUpdateTime >= DB_THROTTLE_MS && !isAiNotConfigured(fullContent)) {
              lastDbUpdateTime = now;
              const sliced = fullContent.slice(0, MAX_CONTENT_CHARS);
              prisma.message.update({
                where: { id: aiMessage.id },
                data: { content: sliced },
              }).catch((err) => logger.error('[ai-reply-stream] DB write failed', { error: err }));
            }
            if (now - lastEmitTime >= 100 && !isAiNotConfigured(fullContent)) {
              lastEmitTime = now;
              emitThreadMessage(threadId, {
                id: aiMessage.id,
                content: fullContent.slice(0, MAX_CONTENT_CHARS),
                senderId: aiUser.id,
                senderName: aiUser.name ?? 'Sastram AI',
                senderImage: aiUser.image ?? null,
                createdAt: new Date(),
                threadId,
                parentId: parentMessage.id,
                depth: Math.min((parentMsg?.depth ?? 0) + 1, 4),
                likeCount: 0,
                replyCount: 0,
                isAiResponse: true,
                isComplete: false,
                truncated: false,
                reactions: [],
                attachments: [],
              });
            }
          }
        );

        clearTimeout(timeout);

        if (isAiNotConfigured(fullContent)) {
          const fallbackContent = 'AI features are not configured. Please set an API key to enable AI responses.';
          await prisma.message.update({
            where: { id: aiMessage.id },
            data: { content: fallbackContent },
          });
          send('done', { messageId: aiMessage.id, truncated: false });
          return;
        }

        const truncated = fullContent.length > MAX_CONTENT_CHARS;
        const finalContent = fullContent.slice(0, MAX_CONTENT_CHARS);
        const { sanitized } = sanitizeUserContent(finalContent);

        await prisma.message.update({
          where: { id: aiMessage.id },
          data: { content: sanitized },
        });

        send('done', { messageId: aiMessage.id, truncated });

        emitThreadMessage(threadId, {
          id: aiMessage.id,
          content: sanitized,
          senderId: aiUser.id,
          senderName: aiUser.name ?? 'Sastram AI',
          senderImage: aiUser.image ?? null,
          createdAt: new Date(),
          threadId,
          parentId: parentMessage.id,
          depth: Math.min((parentMsg?.depth ?? 0) + 1, 4),
          likeCount: 0,
          replyCount: 0,
          isAiResponse: true,
          isComplete: true,
          truncated,
          reactions: [],
          attachments: [],
        });
      } catch (error) {
        clearTimeout(timeout);
        logger.error('[ai-reply-stream] Generation error', { error });

        const errorMessage = "Sorry, I couldn't generate a response right now. Please try again later.";
        const fallbackContent = fullContent.slice(0, MAX_CONTENT_CHARS);

        await prisma.message.update({
          where: { id: aiMessage.id },
          data: { content: fallbackContent || errorMessage },
        });

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
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

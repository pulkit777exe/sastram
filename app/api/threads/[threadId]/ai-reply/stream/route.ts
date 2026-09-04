import { prisma } from '@/lib/infrastructure/prisma';
import { NextRequest } from 'next/server';
import { logger } from '@/lib/infrastructure/logger';
import { requireSessionOrThrow } from '@/modules/auth';
import { requireThreadAccessOrThrow } from '@/lib/thread-access';
import { rateLimit } from '@/lib/services/rate-limit';
import { getRequestIp } from '@/lib/utils/request-ip';
import { consumeSpendCap } from '@/lib/services/ai-spend-cap';
import { evaluateAiCostGate, AiCallPath } from '@/lib/services/ai-cost-classification';
import { trackNeonRequest } from '@/lib/services/usage-check';
import { extractAiInlineQuery } from '@/modules/messages/actions/ai-inline';
import { z } from 'zod';
import { sseEvent, sseHeaders } from '@/lib/utils/sse';
import { HTTP_STATUS } from '@/lib/utils/api-response';
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

function errorSseResponse(message: string, status: number): Response {
  return new Response(sseEvent('error', { error: message }), {
    status,
    headers: sseHeaders(),
  });
}

function createSseSender(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  closedRef: { closed: boolean }
) {
  return function sendEvent(event: string, data: unknown) {
    if (closedRef.closed) return;
    try {
      controller.enqueue(encoder.encode(sseEvent(event, data)));
    } catch {
      closedRef.closed = true;
    }
  };
}

async function authenticateRequest(): Promise<{ session: Awaited<ReturnType<typeof requireSessionOrThrow>> } | { error: Response }> {
  try {
    const session = await requireSessionOrThrow();
    return { session };
  } catch {
    return { error: errorSseResponse('Unauthorized', HTTP_STATUS.UNAUTHORIZED) };
  }
}

function validateThreadParams(threadId: string): Response | null {
  const parsedParams = paramsSchema.safeParse({ threadId });
  if (!parsedParams.success) {
    return errorSseResponse('Invalid thread ID', HTTP_STATUS.BAD_REQUEST);
  }
  return null;
}

async function checkRateLimitOrThrow(session: { user: { id: string } }, request: NextRequest): Promise<Response | null> {
  const ip = getRequestIp(request);
  const rateLimitResult = await rateLimit({ key: `ai-reply-stream:${session.user.id}:${ip}`, type: 'api' });
  if (!rateLimitResult.success) {
    return errorSseResponse('Too many requests', HTTP_STATUS.RATE_LIMITED);
  }
  return null;
}

async function checkThreadAccessOrResponse(threadId: string, session: { user: { id: string; role: unknown } }): Promise<Response | null> {
  try {
    await requireThreadAccessOrThrow(threadId, session.user.id, session.user.role as never);
    return null;
  } catch {
    return errorSseResponse('Forbidden', HTTP_STATUS.FORBIDDEN);
  }
}

async function resolveParentMessage(threadId: string, requestedMessageIdRaw: string | null) {
  const requestedMessageId = requestedMessageIdRaw;
  if (requestedMessageId !== null && requestedMessageId !== '') {
    return prisma.message.findFirst({
      where: { id: requestedMessageId, threadId, deletedAt: null },
    });
  }
  return prisma.message.findFirst({
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
}

function resolveQuery(parentMessage: { content: string }): { query: string | null; error: Response | null } {
  const parsed = extractAiInlineQuery(parentMessage.content);
  let query: string | null = null;
  if (parsed) {
    query = parsed;
  } else {
    const legacy = parentMessage.content.replace(/(?:^|\s)@ai\s+/i, '').trim();
    query = legacy;
  }
  const hasAtSaiQuestion = extractAiInlineQuery(parentMessage.content) !== null;
  const hasAtAiQuestion = /(?:^|\s)@ai\s+\S+/i.test(parentMessage.content);
  if (!hasAtSaiQuestion && !hasAtAiQuestion) {
    return { query: null, error: errorSseResponse('No question found after @sai', HTTP_STATUS.BAD_REQUEST) };
  }
  if (!query) {
    return { query: null, error: errorSseResponse('No question found after @sai', HTTP_STATUS.BAD_REQUEST) };
  }
  return { query, error: null };
}

async function checkSpendCapOrResponse(): Promise<Response | null> {
  const spendCap = await consumeSpendCap();
  const gate = evaluateAiCostGate({
    path: AiCallPath.AI_REPLY_STREAM,
    spendCapAllowed: spendCap.allowed,
  });
  if (!gate.allowed) {
    return errorSseResponse('AI features temporarily unavailable', HTTP_STATUS.SERVICE_UNAVAILABLE);
  }
  return null;
}

export async function GET(
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> }
) {
  const encoder = new TextEncoder();

  const auth = await authenticateRequest();
  if ('error' in auth) return auth.error;
  const session = auth.session;

  let threadId: string;
  if (context && context.params) {
    const params = await context.params;
    threadId = params.threadId;
  } else {
    threadId = '';
  }

  const paramError = validateThreadParams(threadId);
  if (paramError) return paramError;

  const rateLimitError = await checkRateLimitOrThrow(session, request);
  if (rateLimitError) return rateLimitError;

  const accessError = await checkThreadAccessOrResponse(threadId, session);
  if (accessError) return accessError;

  const rawMessageId = request.nextUrl.searchParams.get('messageId');
  const parentMessage = await resolveParentMessage(threadId, rawMessageId);

  if (!parentMessage) {
    return errorSseResponse('No @sai mention found', HTTP_STATUS.BAD_REQUEST);
  }

  const queryResult = resolveQuery(parentMessage);
  if (queryResult.error) return queryResult.error;
  const query = queryResult.query as string;

  const spendError = await checkSpendCapOrResponse();
  if (spendError) return spendError;

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
      const closedRef = { closed: false };
      const sendEvent = createSseSender(controller, encoder, closedRef);

      request.signal.addEventListener('abort', () => {
        closedRef.closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });

      const timeout = setTimeout(() => {
        if (!closedRef.closed) {
          sendEvent('error', { error: 'Generation timed out' });
          closedRef.closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }, TIMEOUT_MS);

      sendEvent('start', {
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
        const result = await streamAiReplyToMessage({
          query,
          context: threadContext,
          aiMessageId: aiMessage.id,
          onToken: (chunk) => sendEvent('token', { content: chunk }),
          signal: request.signal,
        });

        clearTimeout(timeout);

        if (result.isFallback) {
          sendEvent('done', { messageId: aiMessage.id, truncated: false });
          return;
        }

        sendEvent('done', { messageId: aiMessage.id, truncated: result.truncated });
      } catch (error) {
        clearTimeout(timeout);
        logger.error('[ai-reply-stream] Generation error', { error });

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

        sendEvent('error', { error: 'Generation failed', messageId: aiMessage.id });
      } finally {
        if (!closedRef.closed) {
          closedRef.closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }
    },
  });

  return new Response(stream, {
    status: HTTP_STATUS.OK,
    headers: sseHeaders(),
  });
}

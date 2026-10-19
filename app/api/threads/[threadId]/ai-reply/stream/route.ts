import { prisma } from '@/lib/infrastructure/prisma';
import { NextRequest } from 'next/server';
import { logger } from '@/lib/infrastructure/logger';
import { trackNeonRequest } from '@/lib/services/usage-check';
import { guardAiRoute } from '@/lib/middleware/ai-guard-route';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { extractAiInlineQuery } from '@/modules/messages/actions/ai-inline';
import { z } from 'zod';
import { createSSEStream, createSseSender, sseEvent, sseHeaders } from '@/lib/utils/sse';
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

type ExistingAiReply = {
  id: string;
  content: string;
  depth: number;
  createdAt: Date;
  senderId: string | null;
  sender: { name: string | null; image: string | null } | null;
};

function errorSseResponse(message: string, status: number): Response {
  return new Response(sseEvent('error', { error: message }), {
    status,
    headers: sseHeaders(),
  });
}

function validateThreadParams(threadId: string): Response | null {
  const parsedParams = paramsSchema.safeParse({ threadId });
  if (!parsedParams.success) {
    return errorSseResponse('Invalid thread ID', HTTP_STATUS.BAD_REQUEST);
  }
  return null;
}

/** Depth is selected here so the stream path does not need a third round-trip. */
async function resolveParentMessage(threadId: string, requestedMessageIdRaw: string | null) {
  const requestedMessageId = requestedMessageIdRaw;
  if (requestedMessageId !== null && requestedMessageId !== '') {
    return prisma.message.findFirst({
      where: { id: requestedMessageId, threadId, deletedAt: null },
      select: { id: true, content: true, depth: true },
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
    select: { id: true, content: true, depth: true },
  });
}

async function findExistingAiReply(threadId: string, parentId: string): Promise<ExistingAiReply | null> {
  return prisma.message.findFirst({
    where: { threadId, parentId, isAiResponse: true },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      content: true,
      depth: true,
      createdAt: true,
      senderId: true,
      sender: { select: { name: true, image: true } },
    },
  });
}

/**
 * Idempotent replay: a non-empty row is treated as a completed reply (the
 * final sanitized write always lands last — see streamAiReplyToMessage — so
 * the only detectable incomplete state is empty content from a crash before
 * the first throttled flush).
 */
function buildReplayResponse(
  request: NextRequest,
  threadId: string,
  parentId: string,
  existingReply: ExistingAiReply
): Response {
  const startPayload = {
    messageId: existingReply.id,
    parentId,
    threadId,
    depth: existingReply.depth,
    createdAt: existingReply.createdAt.toISOString(),
    senderId: existingReply.senderId,
    senderName: existingReply.sender?.name ?? 'Sastram AI',
    senderImage: existingReply.sender?.image ?? null,
  };

  return createSSEStream(request, async (controller, send) => {
    send({ event: 'start', data: JSON.stringify(startPayload) });
    send({ event: 'token', data: JSON.stringify({ content: existingReply.content }) });
    send({ event: 'done', data: JSON.stringify({ messageId: existingReply.id, truncated: false }) });
    controller.close();
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

export async function GET(
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> }
) {
  const encoder = new TextEncoder();

  let threadId: string;
  if (context && context.params) {
    const params = await context.params;
    threadId = params.threadId;
  } else {
    threadId = '';
  }

  const paramError = validateThreadParams(threadId);
  if (paramError) return paramError;

  // Spend is consumed here, before any DB writes — the sync stream path bills
  // once in the route; no worker is involved.
  const guard = await guardAiRoute(request, {
    path: AiCallPath.AI_REPLY_STREAM,
    quota: null,
    threadId,
    rateLimitScope: 'ai-reply-stream',
    sse: true,
  });
  if (!guard.ok) return guard.response;

  const rawMessageId = request.nextUrl.searchParams.get('messageId');
  const parentMessage = await resolveParentMessage(threadId, rawMessageId);

  if (!parentMessage) {
    return errorSseResponse('No @sai mention found', HTTP_STATUS.BAD_REQUEST);
  }

  const queryResult = resolveQuery(parentMessage);
  if (queryResult.error) return queryResult.error;
  const query = queryResult.query as string;

  // Find-or-reuse (mirrors the ai-inline worker): a retry or double-open must
  // not create a duplicate AI message or run a second paid LLM stream.
  const existingReply = await findExistingAiReply(threadId, parentMessage.id);
  if (existingReply && existingReply.content.trim().length > 0) {
    void trackNeonRequest();
    return buildReplayResponse(request, threadId, parentMessage.id, existingReply);
  }

  const [threadContext, aiUser] = await Promise.all([
    fetchThreadContext(threadId),
    getOrCreateAiUser(),
  ]);

  const aiMessage = existingReply ?? (await createAiReplyMessageTx({
    threadId,
    parentId: parentMessage.id,
    parentDepth: parentMessage.depth,
    aiUserId: aiUser.id,
  }));
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
        depth: aiMessage.depth,
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

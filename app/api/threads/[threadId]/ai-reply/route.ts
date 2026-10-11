import { prisma } from '@/lib/infrastructure/prisma';
import { enqueueInlineJob } from '@/lib/services/queue';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/infrastructure/logger';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { guardAiRoute } from '@/lib/middleware/ai-guard-route';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { extractAiInlineQuery } from '@/modules/messages/actions/ai-inline';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const aiReplyParamsSchema = z.object({
  threadId: z.string().cuid(),
});

async function extractThreadId(context?: { params: Promise<Record<string, string>> }): Promise<string> {
  if (context && context.params) {
    const params = await context.params;
    return params.threadId;
  }
  return '';
}

function validateThreadId(threadId: string): NextResponse | null {
  const parsedParams = aiReplyParamsSchema.safeParse({ threadId });
  if (!parsedParams.success) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid thread ID'), { status: HTTP_STATUS.BAD_REQUEST });
  }
  return null;
}

async function resolveParentMessage(threadId: string) {
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

function resolveQuery(parentMessage: { content: string }): string | null {
  const parsedQuery = extractAiInlineQuery(parentMessage.content);
  if (parsedQuery) {
    return parsedQuery;
  }
  const legacy = parentMessage.content.replace(/(?:^|\s)@ai\s+/i, '').trim();
  return legacy;
}

async function handleAiEnqueue(parentMessage: { id: string; threadId: string }, query: string, sessionUserId: string, threadId: string) {
  logger.info('[ai-reply] Queuing job:', { threadId, messageId: parentMessage.id, query });
  await enqueueInlineJob({
    messageId: parentMessage.id,
    threadId: parentMessage.threadId,
    query,
    userId: sessionUserId,
    // Route already consumed spend via guardAiRoute — stamp the
    // request-scoped idempotency key so the worker skips re-consumption.
    alreadyBilled: randomUUID(),
  });
}

const handler = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> }
) => {
  const threadId = await extractThreadId(context);
  const paramError = validateThreadId(threadId);
  if (paramError) return paramError;

  const guard = await guardAiRoute(request, {
    path: AiCallPath.AI_REPLY_STREAM,
    quota: { kind: 'analysis' },
    threadId,
    rateLimitScope: 'ai-reply',
    sse: false,
  });
  if (!guard.ok) return guard.response;
  const session = guard.session;

  const parentMessage = await resolveParentMessage(threadId);
  if (!parentMessage) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'No @sai mention found'), { status: HTTP_STATUS.BAD_REQUEST });
  }

  const query = resolveQuery(parentMessage);
  if (!query) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'No question found after @sai'), { status: HTTP_STATUS.BAD_REQUEST });
  }

  await handleAiEnqueue(parentMessage, query, session.user.id, threadId);

  return NextResponse.json(ok({ queued: true }));
});

export { handler as POST };

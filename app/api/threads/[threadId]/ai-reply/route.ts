import { prisma } from '@/lib/infrastructure/prisma';
import { enqueueInlineJob } from '@/lib/infrastructure/bullmq';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/infrastructure/logger';
import { requireThreadMembershipOrThrow, requireSessionOrThrow } from '@/modules/auth/session';
import { ok, fail, withErrorHandling } from '@/lib/utils/api-response';
import { rateLimit } from '@/lib/services/rate-limit';
import { z } from 'zod';

const aiReplyParamsSchema = z.object({
  threadId: z.string().cuid(),
});

const handler = withErrorHandling(async (
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> }
) => {
  const session = await requireSessionOrThrow();

  const threadId = context?.params ? (await context.params).threadId : '';
  const parsedParams = aiReplyParamsSchema.safeParse({ threadId });
  if (!parsedParams.success) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid thread ID'), { status: 400 });
  }

  // Rate limit AI reply requests
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const rateLimitResult = await rateLimit({ key: `ai-reply:${session.user.id}:${ip}`, type: 'api' });
  if (!rateLimitResult.success) {
    return NextResponse.json(fail('RATE_LIMITED', 'Too many requests. Please try again later.'), { status: 429 });
  }

  try {
    await requireThreadMembershipOrThrow(threadId, session.user.id);
  } catch {
    return NextResponse.json(fail('FORBIDDEN', 'Forbidden'), { status: 403 });
  }

  // Find the latest message with @ai mention in this thread
  const parentMessage = await prisma.message.findFirst({
    where: {
      threadId: threadId,
      content: { contains: '@ai' },
    },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });

  if (!parentMessage) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'No @ai mention found'), { status: 400 });
  }

  // Extract the query from the message (remove @ai mentions)
  const query = parentMessage.content.replace(/@ai\s*/gi, '').trim();

  if (!query) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'No question found after @ai'), { status: 400 });
  }

  logger.info('[ai-reply] Queuing job:', { threadId, messageId: parentMessage.id, query });

  // Enqueue the AI inline job
  await enqueueInlineJob({
    messageId: parentMessage.id,
    threadId: parentMessage.threadId,
    query,
    userId: session.user.id,
  });

  return NextResponse.json(ok({ queued: true }));
});

export { handler as POST };
import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, withErrorHandling } from '@/lib/utils/api-response';
import { prisma } from '@/lib/infrastructure/prisma';
import { AIJobType } from '@/lib/queue/config';
import { enqueueJob } from '@/lib/services/queue';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { getEnv } from '@/lib/config/env';
import { withAiPreflight } from '@/lib/middleware/ai-preflight';
import { z } from 'zod';

const summaryRequestSchema = z.object({
  threadId: z.string(),
});

const handler = withErrorHandling(async (req: NextRequest) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid JSON in request body'), { status: 400 });
  }

  const parsed = summaryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(fail('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid request'), { status: 400 });
  }
  const { threadId } = parsed.data;

  const preflight = await withAiPreflight(req, {
    aiCallPath: AiCallPath.THREAD_SUMMARY,
    threadId,
  });
  if (preflight instanceof NextResponse) return preflight;

  const totalMessageCount = await prisma.message.count({
    where: { threadId: threadId, deletedAt: null },
  });

  if (totalMessageCount < 20) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Thread needs at least 20 messages before a summary can be generated.'), { status: 400 });
  }

  const thread = await prisma.thread.findFirst({
    where: { id: threadId, deletedAt: null },
    include: {
      messages: {
        take: getEnv().AI_ANALYSIS_MESSAGE_LIMIT,
        orderBy: { createdAt: 'asc' },
        include: { sender: true },
      },
    },
  });

  if (!thread) {
    return NextResponse.json(fail('NOT_FOUND', 'Thread not found'), { status: 404 });
  }

  const messages = thread.messages;

  await enqueueJob(AIJobType.GENERATE_THREAD_SUMMARY, { threadId, messages, userId: preflight.session.user.id });

  return NextResponse.json(ok({ status: 'pending', message: 'Summary generation started' }));
});

export { handler as POST };

import { auth } from '@/lib/services/auth';
import { prisma } from '@/lib/infrastructure/prisma';
import { enqueueInlineJob } from '@/lib/infrastructure/bullmq';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/infrastructure/logger';
import { requireThreadMembershipOrThrow } from '@/modules/auth/session';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      await requireThreadMembershipOrThrow(threadId, session.user.id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
      return NextResponse.json({ error: 'No @ai mention found' }, { status: 400 });
    }

    // Extract the query from the message (remove @ai mentions)
    const query = parentMessage.content.replace(/@ai\s*/gi, '').trim();

    if (!query) {
      return NextResponse.json({ error: 'No question found after @ai' }, { status: 400 });
    }

    logger.info('[ai-reply] Queuing job:', { threadId, messageId: parentMessage.id, query });

    // Enqueue the AI inline job
    await enqueueInlineJob({
      messageId: parentMessage.id,
      threadId: parentMessage.threadId,
      query,
      userId: session.user.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[ai-reply API]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to queue AI job' },
      { status: 500 }
    );
  }
}
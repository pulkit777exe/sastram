import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/modules/auth/session';
import { prisma } from '@/lib/infrastructure/prisma';
import { aiService } from '@/lib/services/ai';
import { z } from 'zod';

const scoreRequestSchema = z.object({
  threadId: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { threadId } = scoreRequestSchema.parse(body);

    // Fetch thread and messages
    const thread = await prisma.section.findUnique({
      where: { id: threadId },
      include: {
        messages: {
          take: parseInt(process.env.AI_ANALYSIS_MESSAGE_LIMIT || '50', 10), // Limit to configured number of messages for score calculation
          orderBy: { createdAt: 'desc' },
          include: { sender: true },
        },
      },
    });

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    // Reverse to chronological order for AI
    const messages = thread.messages.reverse();

    if (messages.length === 0) {
      return NextResponse.json({ score: 0 });
    }

    // Calculate resolution score
    const score = await aiService.calculateResolutionScore(messages);

    // Update thread with new score
    await prisma.section.update({
      where: { id: threadId },
      data: { resolutionScore: score },
    });

    return NextResponse.json({ score });
  } catch (error) {
    console.error('Error calculating resolution score:', error);
    return NextResponse.json({ error: 'Failed to calculate resolution score' }, { status: 500 });
  }
}

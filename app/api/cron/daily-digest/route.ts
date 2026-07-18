import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/infrastructure/prisma';
import { aiService, isAiNotConfigured } from '@/lib/services/ai';
import { sendNewsletterDigest } from '@/lib/services/email';
import { logger } from '@/lib/infrastructure/logger';
import { startOfDay, endOfDay } from 'date-fns';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { ok, fail } from '@/lib/utils/api-response';

export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) {
    return authError;
  }

  try {
    const today = new Date();
    const start = startOfDay(today);
    const end = endOfDay(today);

    // 1. Get all active subscriptions (paginated to avoid unbounded queries)
    const BATCH_SIZE = 100;
    let cursor: string | undefined;
    const allSubscriptions: Awaited<ReturnType<typeof fetchBatch>> = [];

    async function fetchBatch(after?: string) {
      return prisma.threadSubscription.findMany({
        where: {
          isActive: true,
          frequency: 'DAILY',
        },
        include: {
          thread: {
            select: {
              id: true,
              name: true,
              slug: true,
              messages: {
                where: {
                  createdAt: { gte: start, lte: end },
                },
                select: {
                  id: true,
                  content: true,
                  senderId: true,
                  createdAt: true,
                  depth: true,
                  sender: { select: { id: true, name: true } },
                },
                orderBy: { createdAt: 'asc' as const },
              },
            },
          },
        },
        take: BATCH_SIZE,
        ...(after ? { cursor: { id: after }, skip: 1 } : {}),
        orderBy: { id: 'asc' as const },
      });
    }

    do {
      const batch = await fetchBatch(cursor);
      allSubscriptions.push(...batch);
      cursor = batch.length === BATCH_SIZE ? batch[batch.length - 1].id : undefined;
    } while (cursor);

    const subscriptions = allSubscriptions;

    const results = {
      processed: 0,
      sent: 0,
      skipped: 0,
      errors: 0,
    };

    // Group subscriptions by thread to avoid re-generating summary for same thread
    // formatting: Map<ThreadID, { messages: Message[], summary: Promise<string> | string }>
    const threadSummaries = new Map();

    for (const sub of subscriptions) {
      const thread = sub.thread;
      const messages = thread.messages;

      if (messages.length === 0) {
        results.skipped++;
        continue;
      }

      // Generate or retrieve summary for this thread
      let summaryHtml = '';
      try {
        if (!threadSummaries.has(thread.id)) {
          // Store the promise immediately to handle concurrent processing if we parallelize
          // For now it's sequential but good practice
          const summaryPromise = aiService.generateDailyDigest(messages);
          threadSummaries.set(thread.id, summaryPromise);
        }

        summaryHtml = await threadSummaries.get(thread.id);
        if (isAiNotConfigured(summaryHtml)) {
          summaryHtml = '<p><em>AI features aren\'t configured for this deployment.</em></p>';
        }
      } catch (err) {
        logger.error(`Failed to generate summary for thread ${thread.id}:`, err);
        results.errors++;
        continue;
      }

      // Send Email
      try {
        if (!sub.email) {
          results.skipped++;
          continue;
        }

        const uniqueParticipants = new Set(messages.map((m) => m.senderId));

        await sendNewsletterDigest(
          sub.email,
          thread.name,
          summaryHtml,
          `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/threads/${thread.slug}`,
          messages.length,
          uniqueParticipants.size
        );
        results.sent++;
      } catch (err) {
        logger.error(`Failed to send email to ${sub.email}:`, err);
        results.errors++;
      }
      results.processed++;
    }

    return NextResponse.json(ok({ results }));
  } catch (error) {
    logger.error('Daily digest cron error:', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Daily digest failed'), { status: 500 });
  }
}

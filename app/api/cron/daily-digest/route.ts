import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/infrastructure/prisma';
import { aiService, isAiNotConfigured } from '@/lib/ai';
import { sendNewsletterDigest } from '@/lib/services/email';
import { logger } from '@/lib/infrastructure/logger';
import { startOfDay, endOfDay, subDays, getDay } from 'date-fns';
import { verifyCronAuth } from '@/lib/middleware/cron-auth';
import { ok, fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { enforceAiSpendCap } from '@/lib/services/ai-spend-cap';
import { evaluateAiCostGate, AiCallPath } from '@/lib/services/ai-cost-classification';
import type { DigestFrequency } from '@prisma/client';

/**
 * Determines whether a subscription with the given frequency should be
 * processed today, and returns the date window for fetching messages.
 */
function getDigestWindow(
  frequency: DigestFrequency,
  today: Date
): { process: boolean; start: Date; end: Date } | null {
  const start = startOfDay(today);
  const end = endOfDay(today);

  switch (frequency) {
    case 'DAILY':
      return { process: true, start, end };

    case 'WEEKLY': {
      // Process on Sundays (getDay returns 0 for Sunday)
      const dayOfWeek = getDay(today);
      return { process: dayOfWeek === 0, start: subDays(start, 6), end };
    }

    case 'MONTHLY': {
      // Process on the 1st of each month
      const dayOfMonth = today.getDate();
      return { process: dayOfMonth === 1, start: subDays(start, 29), end };
    }

    case 'NEVER':
      return null;

    default:
      return null;
  }
}

export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) {
    return authError;
  }

  try {
    const today = new Date();

    // 1. Get all active subscriptions (paginated to avoid unbounded queries)
    const BATCH_SIZE = 100;
    let cursor: string | undefined;
    const allSubscriptions: Awaited<ReturnType<typeof fetchBatch>> = [];

    async function fetchBatch(after?: string) {
      return prisma.threadSubscription.findMany({
        where: {
          isActive: true,
          frequency: { in: ['DAILY', 'WEEKLY', 'MONTHLY'] },
        },
        include: {
          thread: {
            select: {
              id: true,
              name: true,
              slug: true,
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

    const results = {
      processed: 0,
      sent: 0,
      skipped: 0,
      errors: 0,
    };

    // Group subscriptions by thread to avoid re-generating summary for same thread
    const threadSummaries = new Map();

    for (const sub of allSubscriptions) {
      // Check if this frequency should be processed today
      const window = getDigestWindow(sub.frequency, today);
      if (!window || !window.process) {
        results.skipped++;
        continue;
      }

      // Fetch messages within the frequency's time window
      const messages = await prisma.message.findMany({
        where: {
          threadId: sub.threadId,
          createdAt: { gte: window.start, lte: window.end },
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
      });

      const thread = sub.thread;

      if (messages.length === 0) {
        results.skipped++;
        continue;
      }

       // Generate or retrieve summary for this thread
       let summaryHtml = '';
       try {
         const spendCap = await enforceAiSpendCap(AiCallPath.DAILY_DIGEST);
         const gate = evaluateAiCostGate({ path: AiCallPath.DAILY_DIGEST, spendCapAllowed: spendCap.allowed });
         if (!gate.allowed) {
           results.skipped++;
           continue;
         }

         const cacheKey = `${thread.id}-${sub.frequency}`;
         if (!threadSummaries.has(cacheKey)) {
           const summaryPromise = aiService.generateDailyDigest(messages);
           threadSummaries.set(cacheKey, summaryPromise);
         }

        summaryHtml = await threadSummaries.get(cacheKey);
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
    return NextResponse.json(fail('INTERNAL_ERROR', 'Daily digest failed'), { status: HTTP_STATUS.INTERNAL });
  }
}

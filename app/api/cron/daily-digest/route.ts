import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/infrastructure/prisma';
import { aiService, isAiNotConfigured } from '@/lib/ai';
import { sendNewsletterDigest } from '@/lib/services/email';
import { logger } from '@/lib/infrastructure/logger';
import { startOfDay, endOfDay, subDays, getDay } from 'date-fns';
import { verifyCronAuth } from '@/lib/middleware/cron-auth';
import { ok, fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { enforceAiSpendCap } from '@/lib/services/ai-spend-cap';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { env } from '@/lib/config/env';
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

    // Bound each digest to a bounded message window (same knob as the other
    // AI analysis paths) and memoize per (threadId, window) so N subscribers
    // of one thread share a single fetch + a single summary generation.
    const DIGEST_MESSAGE_LIMIT = env.AI_ANALYSIS_MESSAGE_LIMIT;
    const threadMessages = new Map<string, Promise<DigestMessage[]>>();
    const threadSummaries = new Map<string, Promise<string>>();

    async function fetchMessagesByWindow(threadId: string, window: { start: Date; end: Date }) {
      return prisma.message.findMany({
        where: {
          threadId,
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
        // Newest N, reversed back to chronological order for the summary.
        orderBy: { createdAt: 'desc' as const },
        take: DIGEST_MESSAGE_LIMIT,
      });
    }

    type DigestMessage = Awaited<ReturnType<typeof fetchMessagesByWindow>>[number];

    function windowKey(threadId: string, window: { start: Date; end: Date }): string {
      return `${threadId}:${window.start.getTime()}-${window.end.getTime()}`;
    }

    function getMessages(threadId: string, window: { start: Date; end: Date }): Promise<DigestMessage[]> {
      const key = windowKey(threadId, window);
      const cached = threadMessages.get(key);
      if (cached) return cached;

      const pending = fetchMessagesByWindow(threadId, window).then((rows) => rows.reverse());
      // Evict failed fetches so one transient DB error doesn't poison later subscribers.
      pending.catch(() => threadMessages.delete(key));
      threadMessages.set(key, pending);
      return pending;
    }

    for (const sub of allSubscriptions) {
      // Skip before any DB/AI work — a subscription without an email can't send.
      if (!sub.email) {
        results.skipped++;
        continue;
      }

      // Check if this frequency should be processed today
      const window = getDigestWindow(sub.frequency, today);
      if (!window || !window.process) {
        results.skipped++;
        continue;
      }

      // Fetch messages within the frequency's time window (memoized).
      const messages = await getMessages(sub.threadId, window);

      const thread = sub.thread;

      if (messages.length === 0) {
        results.skipped++;
        continue;
      }

      // Generate or retrieve summary for this thread window.
      let summaryHtml = '';
      try {
        const summaryKey = windowKey(thread.id, window);
        let summaryPromise = threadSummaries.get(summaryKey);
        if (!summaryPromise) {
          // Spend is consumed once per actual digest generation, not per
          // subscriber — memoized subscribers reuse the same summary.
          const spendCapResult = await enforceAiSpendCap(AiCallPath.DAILY_DIGEST);
          if (!spendCapResult.allowed) {
            logger.warn('[cron/daily-digest] daily AI spend cap reached — stopping digest run');
            break;
          }

          summaryPromise = aiService.generateDailyDigest(messages);
          // Never cache a rejected summary: one transient failure must not
          // poison every later subscriber of the same thread window.
          summaryPromise.catch(() => threadSummaries.delete(summaryKey));
          threadSummaries.set(summaryKey, summaryPromise);
        }

        summaryHtml = await summaryPromise;
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
        const uniqueParticipants = new Set(messages.map((m) => m.senderId));

        await sendNewsletterDigest(
          sub.email,
          thread.name,
          summaryHtml,
          `${env.NEXT_PUBLIC_APP_URL}/dashboard/threads/${thread.slug}`,
          messages.length,
          uniqueParticipants.size
        );
        // Email jobs are CRITICAL_JOBS in the queue — exempt from the daily
        // QStash cap — so a resolved send is a queued send; publish failures
        // throw and land in the catch below as errors.
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

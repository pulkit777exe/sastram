import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/infrastructure/prisma';
import { sendNewsletterDigest } from '@/lib/services/email';
import {
  fetchDigestMessages,
  generateDigestSummary,
  getDigestWindow,
  type DigestMessage,
} from '@/lib/services/digest';
import { logger } from '@/lib/infrastructure/logger';
import { verifyCronAuth } from '@/lib/middleware/cron-auth';
import { ok, fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { enforceAiSpendCap } from '@/lib/services/ai-spend-cap';
import { AiCallPath } from '@/lib/services/ai-cost-classification';
import { env } from '@/lib/config/env';
import { filterReadableUserIds, type ThreadAccessContext } from '@/lib/thread-access';

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
              createdBy: true,
              visibility: true,
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

    // A subscription is a hint, not proof of access: invitations can be
    // revoked and a public thread can become private after someone subscribes.
    // Resolve each thread's current readers once, before fetching messages.
    const threadContexts = new Map<string, ThreadAccessContext>();
    const subscribersByThread = new Map<string, string[]>();
    for (const sub of allSubscriptions) {
      threadContexts.set(sub.thread.id, {
        threadId: sub.thread.id,
        createdBy: sub.thread.createdBy,
        visibility: sub.thread.visibility,
      });
      if (!sub.userId) continue;
      const subscriberIds = subscribersByThread.get(sub.threadId) ?? [];
      subscriberIds.push(sub.userId);
      subscribersByThread.set(sub.threadId, subscriberIds);
    }

    const readableByThread = new Map<string, Set<string>>();
    await Promise.all(
      [...subscribersByThread.entries()].map(async ([threadId, subscriberIds]) => {
        const context = threadContexts.get(threadId);
        if (!context) return;
        const readable = await filterReadableUserIds(context, subscriberIds);
        readableByThread.set(threadId, new Set(readable));
      })
    );

    // Bound each digest to a bounded message window (same knob as the other
    // AI analysis paths) and memoize per (threadId, window) so N subscribers
    // of one thread share a single fetch + a single summary generation.
    const DIGEST_MESSAGE_LIMIT = env.AI_ANALYSIS_MESSAGE_LIMIT;
    const threadMessages = new Map<string, Promise<DigestMessage[]>>();
    const threadSummaries = new Map<string, Promise<string | null>>();

    function windowKey(threadId: string, window: { start: Date; end: Date }): string {
      return `${threadId}:${window.start.getTime()}-${window.end.getTime()}`;
    }

    function getMessages(threadId: string, window: { start: Date; end: Date }): Promise<DigestMessage[]> {
      const key = windowKey(threadId, window);
      const cached = threadMessages.get(key);
      if (cached) return cached;

      const pending = fetchDigestMessages(threadId, window, DIGEST_MESSAGE_LIMIT);
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

      const canDeliver = sub.userId
        ? readableByThread.get(sub.threadId)?.has(sub.userId) === true
        : sub.thread.visibility === 'PUBLIC';
      if (!canDeliver) {
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

          summaryPromise = generateDigestSummary(messages);
          // Never cache a rejected summary: one transient failure must not
          // poison every later subscriber of the same thread window.
          summaryPromise.catch(() => threadSummaries.delete(summaryKey));
          threadSummaries.set(summaryKey, summaryPromise);
        }

        summaryHtml =
          (await summaryPromise) ??
          '<p><em>AI features aren\'t configured for this deployment.</em></p>';
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

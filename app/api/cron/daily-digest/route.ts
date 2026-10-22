import { NextRequest, NextResponse } from 'next/server';
import { startOfDay } from 'date-fns';
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

export const maxDuration = 60;

const BATCH_SIZE = 100;
// Leave headroom under the 60s function limit for the final write/response.
const TIME_BUDGET_MS = 45_000;

export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) {
    return authError;
  }

  try {
    const today = new Date();
    const startedAt = Date.now();
    // Checkpoint is per local day (the same clock getDigestWindow uses): a
    // second run today only sees subscriptions this run has not attempted yet.
    const dayStart = startOfDay(today);

    const results = {
      processed: 0,
      sent: 0,
      skipped: 0,
      errors: 0,
      hasMore: false,
    };

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

    async function fetchBatch(after?: string) {
      return prisma.threadSubscription.findMany({
        where: {
          isActive: true,
          frequency: { in: ['DAILY', 'WEEKLY', 'MONTHLY'] },
          OR: [{ lastAttemptedAt: null }, { lastAttemptedAt: { lt: dayStart } }],
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
          // The denormalized email is only a snapshot. Resolve the account's
          // current address so a changed email cannot keep receiving digests.
          user: { select: { email: true, deletedAt: true } },
        },
        take: BATCH_SIZE,
        ...(after ? { cursor: { id: after }, skip: 1 } : {}),
        orderBy: { id: 'asc' as const },
      });
    }

    async function markAttempted(subscriptionId: string, sent: boolean): Promise<void> {
      try {
        await prisma.threadSubscription.update({
          where: { id: subscriptionId },
          data: {
            lastAttemptedAt: today,
            ...(sent ? { lastSentAt: today } : {}),
          },
        });
      } catch (error) {
        // A failed checkpoint must not drop the delivery that already happened;
        // it only means the next run may retry this subscription.
        logger.warn(`[cron/daily-digest] failed to checkpoint subscription ${subscriptionId}`, error);
      }
    }

    let cursor: string | undefined;
    let stop = false;

    while (!stop) {
      const batch = await fetchBatch(cursor);
      if (batch.length === 0) break;
      cursor = batch.length === BATCH_SIZE ? batch[batch.length - 1].id : undefined;

      // A subscription is a hint, not proof of access: invitations can be
      // revoked and a public thread can become private after someone subscribes.
      // Resolve each thread's current readers for this page.
      const threadContexts = new Map<string, ThreadAccessContext>();
      const subscribersByThread = new Map<string, string[]>();
      for (const sub of batch) {
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

      for (const sub of batch) {
        if (Date.now() - startedAt >= TIME_BUDGET_MS) {
          results.hasMore = true;
          stop = true;
          break;
        }

        let sent = false;
        try {
          // Prefer the account's current address; the subscription email is a
          // stale snapshot. A deleted account's subscriptions are not deliverable.
          const recipient = sub.userId ? sub.user?.email : sub.email;
          if (!recipient || (sub.userId && sub.user?.deletedAt)) {
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
          const summaryKey = windowKey(thread.id, window);
          let summaryPromise = threadSummaries.get(summaryKey);
          if (!summaryPromise) {
            // Spend is consumed once per actual digest generation, not per
            // subscriber — memoized subscribers reuse the same summary.
            const spendCapResult = await enforceAiSpendCap(AiCallPath.DAILY_DIGEST);
            if (!spendCapResult.allowed) {
              logger.warn('[cron/daily-digest] daily AI spend cap reached — stopping digest run');
              results.hasMore = true;
              stop = true;
              break;
            }

            summaryPromise = generateDigestSummary(messages);
            // Never cache a rejected summary: one transient failure must not
            // poison every later subscriber of the same thread window.
            summaryPromise.catch(() => threadSummaries.delete(summaryKey));
            threadSummaries.set(summaryKey, summaryPromise);
          }

          const summaryHtml =
            (await summaryPromise) ??
            '<p><em>AI features aren\'t configured for this deployment.</em></p>';

          const uniqueParticipants = new Set(messages.map((m) => m.senderId));
          await sendNewsletterDigest(
            recipient,
            thread.name,
            summaryHtml,
            `${env.NEXT_PUBLIC_APP_URL}/dashboard/threads/${thread.slug}`,
            messages.length,
            uniqueParticipants.size
          );
          // Email jobs are CRITICAL_JOBS in the queue — exempt from the daily
          // QStash cap — so a resolved send is a queued send; publish failures
          // throw and land in the catch below as errors.
          sent = true;
          results.sent++;
          results.processed++;
        } catch (err) {
          logger.error('[cron/daily-digest] subscription failed', err);
          results.errors++;
          results.processed++;
        } finally {
          // Checkpoint successes, skips, and failures so a second invocation
          // today advances to the next page instead of rescanning this one.
          await markAttempted(sub.id, sent);
        }
      }

      if (stop || !cursor) break;
    }

    return NextResponse.json(ok({ results }));
  } catch (error) {
    logger.error('Daily digest cron error:', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Daily digest failed'), { status: HTTP_STATUS.INTERNAL });
  }
}

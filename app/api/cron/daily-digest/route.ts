import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/infrastructure/prisma';
import { aiService } from '@/lib/services/ai';
import { sendEmail } from '@/lib/services/email';
import { logger } from '@/lib/infrastructure/logger';
import { startOfDay, endOfDay } from 'date-fns';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
import { ROUTES } from '@/lib/config/routes';
import { escapeHtml } from '@/lib/utils/escape';
import { ok, fail } from '@/lib/utils/api-response';
import sanitizeHtml from 'sanitize-html';

export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) {
    return authError;
  }

  try {
    const today = new Date();
    const start = startOfDay(today);
    const end = endOfDay(today);

    // 1. Get all active subscriptions
    const subscriptions = await prisma.threadSubscription.findMany({
      where: {
        isActive: true,
        frequency: 'DAILY',
      },
      include: {
        thread: {
          include: {
            messages: {
              where: {
                createdAt: {
                  gte: start,
                  lte: end,
                },
              },
              include: { sender: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    const results = {
      processed: 0,
      sent: 0,
      skipped: 0,
      errors: 0,
    };

    // 2. Group subscriptions by thread
    const subsByThread = new Map<string, typeof subscriptions>();
    for (const sub of subscriptions) {
      if (sub.thread.messages.length === 0) {
        results.skipped++;
        continue;
      }
      const existing = subsByThread.get(sub.thread.id) || [];
      existing.push(sub);
      subsByThread.set(sub.thread.id, existing);
    }

    // 3. Generate summaries in parallel (one per unique thread)
    const summaryPromises = new Map<string, Promise<string>>();
    for (const [threadId, subs] of subsByThread) {
      const thread = subs[0].thread;
      summaryPromises.set(
        threadId,
        aiService.generateDailyDigest(thread.messages).catch((err) => {
          logger.error(`Failed to generate summary for thread ${threadId}:`, err);
          return '';
        })
      );
    }

    // Wait for all summaries to generate
    const summaries = await Promise.allSettled(
      Array.from(summaryPromises.entries()).map(async ([threadId, promise]) => {
        const html = await promise;
        return { threadId, html };
      })
    );

    const summaryMap = new Map<string, string>();
    for (const result of summaries) {
      if (result.status === 'fulfilled' && result.value.html) {
        summaryMap.set(result.value.threadId, result.value.html);
      }
    }

    // 4. Send emails in parallel (batch of 10 to avoid SMTP overload)
    const emailPromises: Promise<void>[] = [];
    for (const [threadId, subs] of subsByThread) {
      const summaryHtml = summaryMap.get(threadId);
      if (!summaryHtml) {
        results.errors++;
        continue;
      }

      const thread = subs[0].thread;

      for (const sub of subs) {
        if (!sub.email) {
          results.skipped++;
          continue;
        }

        emailPromises.push(
          sendEmail({
            to: sub.email,
            subject: `Daily Digest: ${thread.name}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Daily Digest for ${escapeHtml(thread.name)}</h2>
                <div style="background-color: #f4f4f5; padding: 20px; border-radius: 8px;">
                  ${sanitizeHtml(summaryHtml, { allowedTags: ['h3', 'p', 'ul', 'li', 'strong', 'em', 'b', 'i'], allowedAttributes: {} })}
                </div>
                <p style="margin-top: 20px; font-size: 12px; color: #666;">
                  You are receiving this because you subscribed to this thread.
                  <a href="${process.env.NEXT_PUBLIC_APP_URL}${ROUTES.THREAD(thread.slug)}">View Thread</a>
                </p>
              </div>
            `,
          })
            .then(() => { results.sent++; })
            .catch((err) => {
              logger.error(`Failed to send email to ${sub.email}:`, err);
              results.errors++;
            })
            .finally(() => { results.processed++; })
        );
      }
    }

    // Process emails in batches of 10 to avoid SMTP rate limits
    const BATCH_SIZE = 10;
    for (let i = 0; i < emailPromises.length; i += BATCH_SIZE) {
      await Promise.allSettled(emailPromises.slice(i, i + BATCH_SIZE));
    }

    return NextResponse.json(ok(results));
  } catch (error) {
    logger.error('Daily digest cron error:', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Daily digest failed'), { status: 500 });
  }
}

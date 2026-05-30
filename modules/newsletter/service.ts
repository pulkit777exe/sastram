'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/services/auth';
import { headers } from 'next/headers';
import { aiService } from '@/lib/services/ai';
import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { ROUTES } from '@/lib/config/routes';
import {
  completeDigest,
  getDueDigests,
  getThreadTranscript,
  listThreadSubscribers,
  markDigestProcessing,
  scheduleThreadDigest,
  subscribeToThreadNewsletter,
} from './repository';

export async function subscribeToThread({ threadId, slug }: { threadId: string; slug: string }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error('You must be signed in to subscribe');
  }

  const email = session.user.email;
  await subscribeToThreadNewsletter({
    threadId,
    userId: session.user.id,
    email,
  });

  await scheduleThreadDigest(threadId);
  revalidatePath(ROUTES.THREAD(slug));
}

export async function processPendingDigests() {
  const digests = await getDueDigests();
  for (const digest of digests) {
    await markDigestProcessing(digest.id);
    const transcript = await getThreadTranscript(digest.threadId);

    // Get unique participants
    const uniqueParticipants = new Set(
      transcript.map((m) => m.sender?.id || m.sender?.email).filter(Boolean)
    );

    const content = transcript
      .map(
        (message) =>
          `${message.sender?.name || message.sender?.email || 'Anonymous'}: ${message.content}`
      )
      .join('\n');

    let summary: string;
    try {
      summary = await aiService.generateSummary(content);
    } catch (error) {
      logger.error(`Failed to generate AI summary for thread ${digest.threadId}:`, error);
      summary = `This thread had ${transcript.length} messages from ${uniqueParticipants.size} participants. Join the discussion to see what's happening!`;
    }

    const subscribers = await listThreadSubscribers(digest.threadId);

    // Get thread info for email
    const thread = await prisma.thread.findUnique({
      where: { id: digest.threadId },
      select: { name: true, slug: true, messageCount: true },
    });

    if (!thread) {
      logger.error(`Thread ${digest.threadId} not found for digest`);
      await completeDigest(digest.id, summary, 0);
      continue;
    }

    const threadUrl = `${process.env.NEXT_PUBLIC_APP_URL}${ROUTES.THREAD(thread.slug)}`;

    const { sendNewsletterDigest } = await import('@/lib/services/email');
    const BATCH_SIZE = 5;
    let emailCount = 0;

    const validSubscribers = subscribers.filter((s) => {
      if (!s.email) {
        logger.warn(`Skipping digest email for subscriber ${s.userId} — no email set`);
        return false;
      }
      return true;
    });

    for (let i = 0; i < validSubscribers.length; i += BATCH_SIZE) {
      const batch = validSubscribers.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((subscriber) =>
          sendNewsletterDigest(
            subscriber.email!,
            thread.name,
            summary,
            threadUrl,
            thread.messageCount || transcript.length,
            uniqueParticipants.size
          ).then(() => {
            logger.info(`Sent digest email to ${subscriber.email} for thread ${thread.name}`);
            return subscriber.email;
          })
        )
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          emailCount++;
        } else {
          logger.error(`Failed to send digest email:`, result.reason);
        }
      }
    }

    await completeDigest(digest.id, summary, emailCount);
    logger.info(`Completed digest for thread ${thread.name}: sent ${emailCount} emails`);
  }
}

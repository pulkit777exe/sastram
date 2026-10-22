import { startOfDay, endOfDay, subDays, getDay } from 'date-fns';
import type { DigestFrequency } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';
import { aiService } from '@/lib/ai';
import { isAiNotConfigured } from '@/lib/services/ai-sentinel';
import type { MessageInput } from '@/lib/ai';

/**
 * Shared seam for the two daily-digest producers:
 * - `app/api/cron/daily-digest` — email, frequency-gated, memoized per
 *   `(threadId, window)` so N subscribers share one fetch + one generation;
 * - the `daily-digest` queue worker in `lib/queue/workers/ai-jobs` — in-app
 *   notification for thread subscribers.
 *
 * Recipient selection, spend caps and delivery deliberately stay with each
 * caller: the email path filters on `ThreadSubscription.frequency`/`email`
 * and sends via Resend, while the worker dispatches notifications to
 * subscriber userIds.
 */

export interface DigestWindow {
  start: Date;
  end: Date;
}

/**
 * Determines whether a subscription with the given frequency should be
 * processed today, and returns the date window for fetching messages.
 */
export function getDigestWindow(
  frequency: DigestFrequency,
  today: Date
): ({ process: boolean } & DigestWindow) | null {
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

export interface DigestMessage extends MessageInput {
  id: string;
  senderId: string | null;
  createdAt: Date;
  depth: number;
  sender: { id: string; name: string | null } | null;
}

/**
 * Newest `limit` messages inside the window, reversed back to chronological
 * order — the order every AI prompt expects.
 */
export async function fetchDigestMessages(
  threadId: string,
  window: DigestWindow,
  limit: number
): Promise<DigestMessage[]> {
  const rows = await prisma.message.findMany({
    where: {
      threadId,
      deletedAt: null,
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
    take: limit,
  });
  return rows.reverse();
}

/**
 * Generates one digest summary. Returns null when no AI provider is
 * configured (the sentinel string is not a digest) — callers choose their
 * fallback: static email copy for the cron route, skipping the notification
 * for the worker. Callers keep their own spend-cap checks and memoization.
 */
export async function generateDigestSummary(messages: MessageInput[]): Promise<string | null> {
  const html = await aiService.generateDailyDigest(messages);
  if (isAiNotConfigured(html)) {
    return null;
  }
  return html;
}

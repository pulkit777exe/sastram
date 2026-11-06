'use server';

import { logger } from '@/lib/infrastructure/logger';

import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth';
import { requireReadOrThrow } from '@/lib/thread-access';
import { revalidatePath } from 'next/cache';
import { subscribeToThreadNewsletter } from './repository';
import { z } from 'zod';
import { withValidation } from '@/lib/utils/server-action';
import { ROUTES } from '@/lib/config/routes';
import { prismaErrorMessage } from '@/lib/utils/errors';
import { threadIdSchema } from '@/lib/utils/validation-common';
import { actionSuccess, actionFailure } from '@/lib/utils/server-action';

function handleNewsletterError(error: unknown) {
  const prismaMsg = prismaErrorMessage(error);
  if (prismaMsg) return actionFailure('INTERNAL_ERROR', prismaMsg);
  return actionFailure('INTERNAL_ERROR', 'Something went wrong');
}

function revalidateNewsletterPath(slug?: string) {
  if (slug) {
    revalidatePath(ROUTES.THREAD(slug));
  } else {
    revalidatePath(ROUTES.DASHBOARD_SETTINGS);
  }
}

const subscribeSchema = z.object({
  threadId: z.string().cuid(),
  slug: z.string().min(1),
});

const updateSubscriptionFrequencySchema = z.object({
  threadId: z.string().cuid(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'NEVER']),
});

export const unsubscribeFromThread = withValidation(
  threadIdSchema,
  'unsubscribeFromThread',
  async ({ threadId }) => {
    try {
      const session = await requireSession(false);

      await prisma.threadSubscription.deleteMany({
        where: {
          threadId,
          userId: session.user.id,
        },
      });

      revalidateNewsletterPath();
      return actionSuccess(null);
    } catch (error) {
      logger.error('[unsubscribeFromThread]', error);
      return handleNewsletterError(error);
    }
  }
);

export const updateSubscriptionFrequencyAction = withValidation(
  updateSubscriptionFrequencySchema,
  'updateSubscriptionFrequency',
  async ({ threadId, frequency }) => {
    try {
      const session = await requireSession(false);

      await prisma.threadSubscription.update({
        where: {
          threadId_userId: {
            threadId,
            userId: session.user.id,
          },
        },
        data: {
          frequency,
        },
      });

      return actionSuccess(null);
    } catch (error) {
      logger.error('[updateSubscriptionFrequency]', error);
      return handleNewsletterError(error);
    }
  }
);

export async function getUserNewsletterSubscriptions() {
  try {
    const session = await requireSession(false);

    // Re-apply thread visibility check per subscription so that threads
    // whose visibility changed after subscription are correctly filtered.
    const subscriptions = await prisma.threadSubscription.findMany({
      where: { userId: session.user.id },
      include: { thread: { select: { id: true, name: true, slug: true, description: true } } },
    });

    const visibleSubs: typeof subscriptions = [];
    for (const sub of subscriptions) {
      try {
        await requireReadOrThrow(sub.thread.id, session.user.id, session.user.role);
        visibleSubs.push(sub);
      } catch {
        // Viewer does not have access to this thread; skip it.
      }
    }

    return actionSuccess(
      visibleSubs.map((sub) => ({
        id: sub.id,
        threadId: sub.threadId,
        thread: sub.thread,
        frequency: sub.frequency,
        createdAt: sub.createdAt,
      }))
    );
  } catch (error) {
    logger.error('[getUserNewsletterSubscriptions]', error);
    return handleNewsletterError(error);
  }
}

export const subscribeToThreadAction = withValidation(
  subscribeSchema,
  'subscribeToThread',
  async ({ threadId, slug }) => {
    const session = await requireSession(false);
    // Digests include thread content, so subscribing is a read operation.
    // Without this gate anyone who knows a private thread's CUID can receive
    // its messages and AI summary by email.
    await requireReadOrThrow(threadId, session.user.id, session.user.role);

    try {
      await subscribeToThreadNewsletter({
        threadId,
        userId: session.user.id,
        email: session.user.email,
        frequency: 'DAILY',
      });

      revalidateNewsletterPath(slug);
      return actionSuccess(null);
    } catch (error) {
      logger.error('[subscribeToThread]', error);
      return handleNewsletterError(error);
    }
  }
);
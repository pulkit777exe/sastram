'use server';

import { logger } from '@/lib/infrastructure/logger';

import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth';
import { revalidatePath } from 'next/cache';
import { subscribeToThreadNewsletter } from './repository';
import { z } from 'zod';
import { withValidation } from '@/lib/utils/server-action';
import { ROUTES } from '@/lib/config/routes';
import { prismaErrorMessage } from '@/lib/utils/errors';
import { threadIdSchema } from '@/lib/utils/validation-common';
import { actionSuccess } from '@/lib/actions/result';

function handleNewsletterError(error: unknown) {
  const prismaMsg = prismaErrorMessage(error);
  if (prismaMsg) return { data: null, error: prismaMsg, ok: false as const, errorCode: 'INTERNAL_ERROR' as const };
  return { data: null, error: 'Something went wrong', ok: false as const, errorCode: 'INTERNAL_ERROR' as const };
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

    const subscriptions = await prisma.threadSubscription.findMany({
      where: { userId: session.user.id },
      include: { thread: { select: { id: true, name: true, slug: true, description: true } } },
    });

    return actionSuccess(subscriptions.map((sub) => ({
      id: sub.id,
      threadId: sub.threadId,
      thread: sub.thread,
      frequency: sub.frequency,
      createdAt: sub.createdAt,
    })));
  } catch (error) {
    logger.error('[getUserNewsletterSubscriptions]', error);
    return handleNewsletterError(error);
  }
}

export const subscribeToThreadAction = withValidation(
  subscribeSchema,
  'subscribeToThread',
  async ({ threadId, slug }) => {
    try {
      const session = await requireSession(false);

      const email = session.user.email;
      await subscribeToThreadNewsletter({
        threadId,
        userId: session.user.id,
        email,
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
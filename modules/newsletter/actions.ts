'use server';

import { logger } from '@/lib/infrastructure/logger';

import { prisma } from '@/lib/infrastructure/prisma';
import { auth } from '@/lib/services/auth';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { subscribeToThreadNewsletter, scheduleThreadDigest } from './repository';
import { z } from 'zod';
import { withValidation } from '@/lib/utils/server-action';

const threadIdSchema = z.object({
  threadId: z.string().cuid(),
});

const subscribeSchema = z.object({
  threadId: z.string().cuid(),
  slug: z.string().min(1),
});

const updateSubscriptionFrequencySchema = z.object({
  threadId: z.string().cuid(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'NEVER']),
});

export const unsubscribeFromThread = withValidation(
  threadIdSchema,
  'unsubscribeFromThread',
  async ({ threadId }) => {
    try {
      const session = await auth.api.getSession({
        headers: await headers(),
      });

      if (!session?.user) {
        return { data: null, error: 'Something went wrong' };
      }

      await prisma.threadSubscription.deleteMany({
        where: {
          threadId,
          userId: session.user.id,
        },
      });

      revalidatePath('/dashboard/settings');
      return { data: null, error: null };
    } catch (error) {
      logger.error('[unsubscribeFromThread]', error);
      return { data: null, error: 'Something went wrong' };
    }
  }
);

export const updateSubscriptionFrequencyAction = withValidation(
  updateSubscriptionFrequencySchema,
  'updateSubscriptionFrequency',
  async ({ threadId, frequency }) => {
    try {
      const session = await auth.api.getSession({
        headers: await headers(),
      });

      if (!session?.user) {
        return { data: null, error: 'Something went wrong' };
      }

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

      return { data: null, error: null };
    } catch (error) {
      logger.error('[updateSubscriptionFrequency]', error);
      return { data: null, error: 'Something went wrong' };
    }
  }
);

export async function getUserNewsletterSubscriptions() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { data: [], error: null };
    }

    const subscriptions = await prisma.threadSubscription.findMany({
      where: { userId: session.user.id },
      include: { thread: { select: { id: true, name: true, slug: true, description: true } } },
    });

    return {
      data: subscriptions.map((sub) => ({
        id: sub.id,
        threadId: sub.threadId,
        thread: sub.thread,
        frequency: sub.frequency,
        createdAt: sub.createdAt,
      })),
      error: null,
    };
  } catch (error) {
    logger.error('[getUserNewsletterSubscriptions]', error);
    return { data: [], error: 'Something went wrong' };
  }
}

export const subscribeToThreadAction = withValidation(
  subscribeSchema,
  'subscribeToThread',
  async ({ threadId, slug }) => {
    try {
      const session = await auth.api.getSession({
        headers: await headers(),
      });

      if (!session?.user) {
        return { data: null, error: 'Something went wrong' };
      }

      const email = session.user.email;
      await subscribeToThreadNewsletter({
        threadId,
        userId: session.user.id,
        email,
      });

      await scheduleThreadDigest(threadId);
      revalidatePath(`/dashboard/threads/thread/${slug}`);
      return { data: null, error: null };
    } catch (error) {
      logger.error('[subscribeToThread]', error);
      return { data: null, error: 'Something went wrong' };
    }
  }
);
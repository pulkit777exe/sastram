'use server';

import { logger } from '@/lib/infrastructure/logger';

import { revalidatePath } from 'next/cache';
import {
  getUserBadges as getUserBadgesRepo,
  checkAndAwardBadges as checkAndAwardBadgesRepo,
  getAllBadges as getAllBadgesRepo,
} from './repository';
import { z } from 'zod';

const userIdSchema = z.object({
  userId: z.string().cuid(),
});

export async function getUserBadgesAction(userId: string) {
  const parsed = userIdSchema.safeParse({ userId });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const badges = await getUserBadgesRepo(parsed.data.userId);
    return { data: badges, error: null };
  } catch (error) {
    logger.error('[getUserBadgesAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function checkAndAwardBadgesAction(userId: string) {
  const parsed = userIdSchema.safeParse({ userId });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const awardedBadges = await checkAndAwardBadgesRepo(parsed.data.userId);
    if (awardedBadges.length > 0) {
      revalidatePath(`/user/${parsed.data.userId}`);
    }
    return { data: awardedBadges, error: null };
  } catch (error) {
    logger.error('[checkAndAwardBadgesAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function getAllBadgesAction() {
  try {
    const badges = await getAllBadgesRepo();
    return { data: badges, error: null };
  } catch (error) {
    logger.error('[getAllBadgesAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

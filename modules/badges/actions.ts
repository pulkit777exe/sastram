'use server';

import { z } from 'zod';
import { logger } from '@/lib/infrastructure/logger';

import { revalidatePath } from 'next/cache';
import {
  getUserBadges as getUserBadgesRepo,
  checkAndAwardBadges as checkAndAwardBadgesRepo,
  getAllBadges as getAllBadgesRepo,
} from './repository';
import { createServerAction } from '@/lib/utils/server-action';
import { userIdSchema } from '@/lib/utils/validation-common';

export const getUserBadgesAction = createServerAction(
  { schema: userIdSchema, actionName: 'getUserBadgesAction' },
  async ({ userId }) => {
    const badges = await getUserBadgesRepo(userId);
    return { data: badges, error: null };
  }
);

export const checkAndAwardBadgesAction = createServerAction(
  { schema: userIdSchema, actionName: 'checkAndAwardBadgesAction' },
  async ({ userId }) => {
    const awardedBadges = await checkAndAwardBadgesRepo(userId);
    if (awardedBadges.length > 0) {
      revalidatePath(`/user/${userId}`);
    }
    return { data: awardedBadges, error: null };
  }
);

export const getAllBadgesAction = createServerAction(
  { schema: z.object({}), actionName: 'getAllBadgesAction' },
  async () => {
    const badges = await getAllBadgesRepo();
    return { data: badges, error: null };
  }
);

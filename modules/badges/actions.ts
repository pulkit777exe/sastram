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
import { requireSession } from '@/modules/auth/session';
import { assertAdmin } from '@/modules/auth/session';

export const getUserBadgesAction = createServerAction(
  { schema: userIdSchema, actionName: 'getUserBadgesAction' },
  async ({ userId }) => {
    await requireSession();
    const badges = await getUserBadgesRepo(userId);
    return { data: badges, error: null };
  }
);

export const checkAndAwardBadgesAction = createServerAction(
  { schema: userIdSchema, actionName: 'checkAndAwardBadgesAction' },
  async ({ userId }) => {
    const session = await requireSession();
    assertAdmin(session.user);
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
    await requireSession();
    const badges = await getAllBadgesRepo();
    return { data: badges, error: null };
  }
);

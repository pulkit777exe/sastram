'use server';

import { z } from 'zod';
import { logger } from '@/lib/infrastructure/logger';

import { requireSession } from '@/modules/auth/session';
import {
  recordActivity as recordActivityRepo,
  getUserActivity as getUserActivityRepo,
  getFollowedUsersActivity as getFollowedUsersActivityRepo,
} from './repository';
import { withValidation } from '@/lib/utils/server-action';
import { activityQuerySchema } from '@/lib/utils/validation-common';

export const recordActivityAction = withValidation(
  z.object({
    type: z.string().min(1),
    entityType: z.string().min(1),
    entityId: z.string().min(1),
    metadata: z.unknown().optional(),
  }),
  'recordActivityAction',
  async (data) => {
    const session = await requireSession();
    await recordActivityRepo({
      userId: session.user.id,
      type: data.type,
      entityType: data.entityType,
      entityId: data.entityId,
      metadata: data.metadata,
    });
    return { data: null, error: null };
  }
);

export const getUserActivityAction = withValidation(
  activityQuerySchema,
  'getUserActivityAction',
  async ({ userId, limit, offset }) => {
    const result = await getUserActivityRepo(
      userId!,
      limit || 20,
      offset || 0
    );
    return { data: result, error: null };
  }
);

export const getFollowedUsersActivityAction = withValidation(
  activityQuerySchema,
  'getFollowedUsersActivityAction',
  async ({ limit, offset }) => {
    const session = await requireSession();
    const result = await getFollowedUsersActivityRepo(
      session.user.id,
      limit || 20,
      offset || 0
    );
    return { data: result, error: null };
  }
);

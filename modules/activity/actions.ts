'use server';

import { z } from 'zod';

import { requireSession } from '@/modules/auth';
import {
  recordActivity as recordActivityRepo,
  getUserActivity as getUserActivityRepo,
} from './repository';
import { withValidation } from '@/lib/utils/server-action';
import { activityQuerySchema } from '@/lib/utils/validation-common';
import { actionSuccess } from '@/lib/actions/result';

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
    await recordActivityRepo({ ...data, userId: session.user.id });
    return actionSuccess(null);
  }
);

export const getUserActivityAction = withValidation(
  activityQuerySchema,
  'getUserActivityAction',
  async ({ userId, limit, offset }) => {
    const session = await requireSession();
    const effectiveUserId = userId ?? session.user.id;
    if (effectiveUserId !== session.user.id && session.user.role !== 'ADMIN' && session.user.role !== 'MODERATOR') {
      const { actionFailure } = await import('@/lib/actions/result');
      return actionFailure('FORBIDDEN', 'Not authorized to view this activity');
    }
    const result = await getUserActivityRepo(effectiveUserId, limit || 20, offset || 0);
    return actionSuccess(result);
  }
);



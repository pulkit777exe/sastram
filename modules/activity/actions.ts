'use server';

import { z } from 'zod';

import { requireSession } from '@/modules/auth';
import {
  recordActivity as recordActivityRepo,
  getUserActivity as getUserActivityRepo,
} from './repository';
import { withValidation } from '@/lib/utils/server-action';
import { activityQuerySchema } from '@/lib/utils/validation-common';
import { actionFailure, actionSuccess } from '@/lib/actions/result';

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

function canViewActivity(sessionUser: { id: string; role: string }, effectiveUserId: string): boolean {
  if (effectiveUserId === sessionUser.id) return true;
  if (sessionUser.role === 'ADMIN') return true;
  if (sessionUser.role === 'MODERATOR') return true;
  return false;
}

export const getUserActivityAction = withValidation(
  activityQuerySchema,
  'getUserActivityAction',
  async ({ userId, limit, offset }) => {
    const session = await requireSession();
    const effectiveUserId = userId ?? session.user.id;
    if (!canViewActivity(session.user, effectiveUserId)) {
      return actionFailure('FORBIDDEN', 'Not authorized to view this activity');
    }
    const result = await getUserActivityRepo(effectiveUserId, limit || 20, offset || 0);
    return actionSuccess(result);
  }
);



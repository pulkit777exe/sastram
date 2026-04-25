import { logger } from '@/lib/infrastructure/logger';
'use server';

import { requireSession } from '@/modules/auth/session';
import {
  recordActivity as recordActivityRepo,
  getUserActivity as getUserActivityRepo,
  getFollowedUsersActivity as getFollowedUsersActivityRepo,
} from './repository';
import { z } from 'zod';

const recordActivitySchema = z.object({
  type: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  metadata: z.unknown().optional(),
});

const activityQuerySchema = z.object({
  userId: z.string().cuid().optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});

export async function recordActivityAction(
  type: string,
  entityType: string,
  entityId: string,
  metadata?: any
) {
  const parsed = recordActivitySchema.safeParse({
    type,
    entityType,
    entityId,
    metadata,
  });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    await recordActivityRepo({
      userId: session.user.id,
      type: parsed.data.type,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      metadata: parsed.data.metadata,
    });
    return { data: null, error: null };
  } catch (error) {
    logger.error('[recordActivityAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function getUserActivityAction(userId: string, limit?: number, offset?: number) {
  const parsed = activityQuerySchema.safeParse({ userId, limit, offset });
  if (!parsed.success || !parsed.data.userId) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const result = await getUserActivityRepo(
      parsed.data.userId,
      parsed.data.limit || 20,
      parsed.data.offset || 0
    );
    return { data: result, error: null };
  } catch (error) {
    logger.error('[getUserActivityAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function getFollowedUsersActivityAction(limit?: number, offset?: number) {
  const parsed = activityQuerySchema.safeParse({ limit, offset });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    const result = await getFollowedUsersActivityRepo(
      session.user.id,
      parsed.data.limit || 20,
      parsed.data.offset || 0
    );
    return { data: result, error: null };
  } catch (error) {
    logger.error('[getFollowedUsersActivityAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

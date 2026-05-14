'use server';

import { logger } from '@/lib/infrastructure/logger';

import { requireSession } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import {
  getUserReputation as getUserReputationRepo,
  awardReputation as awardReputationRepo,
  syncReputationPoints as syncReputationPointsRepo,
} from './repository';
import { z } from 'zod';
import { withValidation } from '@/lib/utils/server-action';

const userIdSchema = z.object({
  userId: z.string().cuid(),
});

const awardSchema = z.object({
  userId: z.string().cuid(),
  points: z.number().int(),
  reason: z.string().min(1),
});

const awardActionSchema = z.object({
  userId: z.string().cuid(),
  action: z.enum(['thread_created', 'message_posted', 'reaction_received', 'follower_gained']),
});

export const getUserReputationAction = withValidation(
  userIdSchema,
  'getUserReputation',
  async ({ userId }) => {
    try {
      const reputation = await getUserReputationRepo(userId);
      return { data: reputation, error: null };
    } catch (error) {
      logger.error('[getUserReputation]', error);
      return { data: null, error: 'Something went wrong' };
    }
  }
);

export const awardReputationAction = withValidation(
  awardSchema,
  'awardReputation',
  async ({ userId, points, reason }) => {
    try {
      const session = await requireSession();

      // Only admins can manually award reputation
      if (session.user.role !== 'ADMIN') {
        return { data: null, error: 'Something went wrong' };
      }

      await awardReputationRepo(userId, points, reason);
      revalidatePath(`/user/${userId}`);
      return { data: null, error: null };
    } catch (error) {
      logger.error('[awardReputation]', error);
      return { data: null, error: 'Something went wrong' };
    }
  }
);

export const syncReputationPointsAction = withValidation(
  userIdSchema,
  'syncReputationPoints',
  async ({ userId }) => {
    try {
      await syncReputationPointsRepo(userId);
      revalidatePath(`/user/${userId}`);
      return { data: null, error: null };
    } catch (error) {
      logger.error('[syncReputationPoints]', error);
      return { data: null, error: 'Something went wrong' };
    }
  }
);

// Helper function to award reputation for common actions
export async function awardReputationForAction(
  userId: string,
  action: 'thread_created' | 'message_posted' | 'reaction_received' | 'follower_gained'
) {
  const parsed = awardActionSchema.safeParse({ userId, action });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  const pointsMap = {
    thread_created: 10,
    message_posted: 1,
    reaction_received: 5,
    follower_gained: 2,
  };

  const points = pointsMap[parsed.data.action];

  try {
    await awardReputationRepo(userId, points, parsed.data.action);
    return { data: null, error: null };
  } catch (error) {
    logger.error('[awardReputationForAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}
'use server';

import { requireSession } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import {
  getUserReputation as getUserReputationRepo,
  awardReputation as awardReputationRepo,
  syncReputationPoints as syncReputationPointsRepo,
} from './repository';
import { z } from 'zod';

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

export async function getUserReputationAction(userId: string) {
  const parsed = userIdSchema.safeParse({ userId });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const reputation = await getUserReputationRepo(parsed.data.userId);
    return { data: reputation, error: null };
  } catch (error) {
    console.error('[getUserReputationAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function awardReputationAction(userId: string, points: number, reason: string) {
  const parsed = awardSchema.safeParse({ userId, points, reason });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();

    // Only admins can manually award reputation
    if (session.user.role !== 'ADMIN') {
      return { data: null, error: 'Something went wrong' };
    }

    await awardReputationRepo(parsed.data.userId, parsed.data.points, parsed.data.reason);
    revalidatePath(`/user/${parsed.data.userId}`);
    return { data: null, error: null };
  } catch (error) {
    console.error('[awardReputationAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function syncReputationPointsAction(userId: string) {
  const parsed = userIdSchema.safeParse({ userId });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    await syncReputationPointsRepo(parsed.data.userId);
    revalidatePath(`/user/${parsed.data.userId}`);
    return { data: null, error: null };
  } catch (error) {
    console.error('[syncReputationPointsAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

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
    if (points) {
      await awardReputationRepo(parsed.data.userId, points, parsed.data.action);
    }
    return { data: null, error: null };
  } catch (error) {
    console.error('[awardReputationForAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

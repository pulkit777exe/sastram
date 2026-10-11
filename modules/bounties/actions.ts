'use server';

import { z } from 'zod';
import { requireSession } from '@/modules/auth';
import { createServerAction } from '@/lib/utils/server-action';
import { actionSuccess, actionFailure } from '@/lib/actions/result';
import { AppError } from '@/lib/utils/errors';
import { logger } from '@/lib/infrastructure/logger';
import { requireReadOrThrow } from '@/lib/thread-access';
import { createBounty, totalBounty } from './repository';

const createBountyInput = z.object({ threadId: z.string().cuid(), amount: z.number().int().min(1).max(1000).default(10) });

export const createBountyAction = createServerAction({ schema: createBountyInput, actionName: 'createBountyAction' }, async ({ threadId, amount }) => {
  try {
    const session = await requireSession();
    await requireReadOrThrow(threadId, session.user.id, session.user.role);
    const bounty = await createBounty(threadId, session.user.id, amount);
    return actionSuccess(bounty);
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === 'NOT_FOUND') return actionFailure('NOT_FOUND', 'Thread not found');
      if (error.code === 'FORBIDDEN') return actionFailure('FORBIDDEN', 'No access');
    }
    logger.error('[createBountyAction]', error);
    return actionFailure('INTERNAL_ERROR', 'Something went wrong');
  }
});

export const getBountyTotalAction = createServerAction({ schema: z.object({ threadId: z.string().cuid() }), actionName: 'getBountyTotalAction' }, async ({ threadId }) => {
  try {
    const session = await requireSession();
    await requireReadOrThrow(threadId, session.user.id, session.user.role);
    const total = await totalBounty(threadId);
    return actionSuccess({ total });
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === 'NOT_FOUND') return actionFailure('NOT_FOUND', 'Thread not found');
      if (error.code === 'FORBIDDEN') return actionFailure('FORBIDDEN', 'No access');
    }
    logger.error('[getBountyTotalAction]', error);
    return actionFailure('INTERNAL_ERROR', 'Failed');
  }
});

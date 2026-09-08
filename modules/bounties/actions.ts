'use server';

import { z } from 'zod';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth';
import { createServerAction } from '@/lib/utils/server-action';
import { actionSuccess } from '@/lib/actions/result';
import { AppError } from '@/lib/utils/errors';
import { logger } from '@/lib/infrastructure/logger';
import { canAccessThread } from '@/lib/thread-access';
import { createBounty, totalBounty } from './repository';

const createBountyInput = z.object({ threadId: z.string().cuid(), amount: z.number().int().min(1).max(1000).default(10) });

export const createBountyAction = createServerAction({ schema: createBountyInput, actionName: 'createBountyAction' }, async ({ threadId, amount }) => {
  try {
    const session = await requireSession();
    const thread = await prisma.thread.findUnique({ where: { id: threadId }, select: { id: true, createdBy: true, visibility: true } });
    if (!thread) throw new AppError('THREAD_NOT_FOUND', 'Thread not found', 404);
    const canAccess = await canAccessThread({ threadId, createdBy: thread.createdBy, visibility: thread.visibility as never }, session.user.id, session.user.role as never);
    if (!canAccess) throw new AppError('FORBIDDEN', 'No access', 403);
    const bounty = await createBounty(threadId, session.user.id, amount);
    return actionSuccess(bounty);
  } catch (error) {
    if (error instanceof AppError) return { data: null, error: error.message, ok: false, errorCode: error.code as never };
    logger.error('[createBountyAction]', error);
    return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' as never };
  }
});

export const getBountyTotalAction = createServerAction({ schema: z.object({ threadId: z.string().cuid() }), actionName: 'getBountyTotalAction' }, async ({ threadId }) => {
  try {
    const total = await totalBounty(threadId);
    return actionSuccess({ total });
  } catch (error) {
    logger.error('[getBountyTotalAction]', error);
    return { data: null, error: 'Failed', ok: false, errorCode: 'INTERNAL_ERROR' as never };
  }
});

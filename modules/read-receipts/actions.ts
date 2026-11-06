'use server';

import { requireSession } from '@/modules/auth';
import { markThreadReadSchema } from '@/modules/read-receipts/schemas';
import { upsertThreadReadReceipt } from '@/modules/read-receipts/repository';
import { logger } from '@/lib/infrastructure/logger';
import { withValidation } from '@/lib/utils/server-action';
import { actionSuccess, actionFailure } from '@/lib/utils/server-action';
import { requireReadOrThrow } from '@/lib/thread-access';
import { AppError } from '@/lib/utils/errors';

export const markThreadReadAction = withValidation(
  markThreadReadSchema,
  'markThreadRead',
  async ({ threadId, lastReadMessageId }) => {
    try {
      const session = await requireSession();
      await requireReadOrThrow(threadId, session.user.id, session.user.role);
      await upsertThreadReadReceipt({
        threadId,
        userId: session.user.id,
        lastReadMessageId: lastReadMessageId ?? null,
      });

      return actionSuccess({ marked: true });
    } catch (error) {
      if (AppError.isAppError(error)) {
        const known = ['AUTH_REQUIRED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'RATE_LIMITED'] as const;
        const code = known.find((c) => c === error.code) ?? 'INTERNAL_ERROR';
        return actionFailure(code, error.message);
      }
      logger.error('[markThreadRead]', error);
      return actionFailure('INTERNAL_ERROR', 'Something went wrong');
    }
  }
);

'use server';

import { requireSession } from '@/modules/auth/session';
import { markThreadReadSchema } from '@/modules/read-receipts/schemas';
import { upsertThreadReadReceipt } from '@/modules/read-receipts/repository';
import { logger } from '@/lib/infrastructure/logger';
import { withValidation } from '@/lib/utils/server-action';
import { actionSuccess } from '@/lib/actions/result';

export const markThreadReadAction = withValidation(
  markThreadReadSchema,
  'markThreadRead',
  async ({ threadId, lastReadMessageId }) => {
    try {
      const session = await requireSession();
      await upsertThreadReadReceipt({
        threadId,
        userId: session.user.id,
        lastReadMessageId: lastReadMessageId ?? null,
      });

      return actionSuccess({ marked: true });
    } catch (error) {
      logger.error('[markThreadRead]', error);
      return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
    }
  }
);

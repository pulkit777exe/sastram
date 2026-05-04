'use server';

import { requireSession } from '@/modules/auth/session';
import { markThreadReadSchema } from '@/modules/read-receipts/schemas';
import { upsertThreadReadReceipt } from '@/modules/read-receipts/repository';
import { logger } from '@/lib/infrastructure/logger';
import { withValidation } from '@/lib/utils/server-action';

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

      return { data: { marked: true }, error: null };
    } catch (error) {
      logger.error('[markThreadRead]', error);
      return { data: null, error: 'Something went wrong' };
    }
  }
);
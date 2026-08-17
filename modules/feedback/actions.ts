'use server';

import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth';
import { createServerAction } from '@/lib/utils/server-action';
import { rateLimit } from '@/lib/services/rate-limit';
import { submitFeedbackSchema } from '@/modules/feedback/schemas';
import { actionSuccess } from '@/lib/actions/result';

export const submitFeedback = createServerAction(
  { schema: submitFeedbackSchema, actionName: 'submitFeedback' },
  async ({ type, message, route }) => {
    // Anonymous feedback is allowed — a missing session just leaves userId null.
    let userId: string | null = null;
    try {
      const session = await requireSession();
      userId = session.user.id;
    } catch {
      userId = null;
    }

    const limitKey = userId ? `feedback:user:${userId}` : `feedback:ip:${route ?? 'unknown'}`;
    const limitResult = await rateLimit({ key: limitKey, type: 'api' });
    if (!limitResult.success) {
      return { data: null, error: 'Too many submissions. Please try again later.', errorCode: 'RATE_LIMITED', ok: false };
    }

    const feedback = await prisma.feedback.create({
      data: {
        userId,
        type,
        message,
        route: route ?? null,
      },
    });

    return actionSuccess({ id: feedback.id });
  }
);

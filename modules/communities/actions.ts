'use server';

import { logger } from '@/lib/infrastructure/logger';
import { buildCommunitySlug } from '@/lib/utils/slug';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession, assertAdmin } from '@/modules/auth';
import { prismaErrorMessage } from '@/lib/utils/errors';
import { ROUTES } from '@/lib/config/routes';
import { createCommunity } from './repository';

const communitySchema = z.object({
  title: z.string().min(3),
  description: z.string().max(280).optional().or(z.literal('')),
});

export async function createCommunityAction(formData: FormData) {
  const parsed = communitySchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description'),
  });

  if (!parsed.success) {
    return { data: null, error: 'Invalid input', ok: false, errorCode: 'VALIDATION_ERROR' };
  }

  try {
    const session = await requireSession();
    assertAdmin(session.user);

    await createCommunity();

    revalidatePath(ROUTES.DASHBOARD);
    return { data: null, error: null, ok: true, errorCode: null };
  } catch (error) {
    logger.error('[createCommunityAction]', error);
    const prismaMsg = prismaErrorMessage(error);
    if (prismaMsg) return { data: null, error: prismaMsg, ok: false, errorCode: 'INTERNAL_ERROR' };
    return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
  }
}

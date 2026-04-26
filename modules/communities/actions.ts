'use server';

import { logger } from '@/lib/infrastructure/logger';
import { buildCommunitySlug } from '@/lib/utils/slug';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession, assertAdmin } from '@/modules/auth/session';
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
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    assertAdmin(session.user);

    const slug = buildCommunitySlug(parsed.data.title);
    await createCommunity({
      title: parsed.data.title,
      description: parsed.data.description,
      slug,
      createdBy: session.user.id,
    });

    revalidatePath('/dashboard');
    return { data: null, error: null };
  } catch (error) {
    logger.error('[createCommunityAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

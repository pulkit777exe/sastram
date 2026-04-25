'use server';

import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { requireSession } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import { put } from '@vercel/blob';
import {
  updateUserProfileSchema,
  updateProfilePrivacySchema,
  updateUserPreferencesSchema,
} from './schemas';
import { FILE_LIMITS } from '@/lib/config/constants';
import { getPublicProfile, getUserThreads, updateProfilePrivacy } from './repository';
import { ProfilePrivacy } from '@prisma/client';
import { z } from 'zod';
import { parseUserPreferences, type UserPreferences } from '@/lib/schemas/user-preferences';

const userIdSchema = z.object({
  userId: z.string().cuid(),
});

const paginationSchema = z.object({
  userId: z.string().cuid(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});

const fileSchema = z.object({
  file: z.custom<File>((val) => val instanceof File),
});

export async function updateUserProfile(formData: FormData) {
  const data = {
    name: formData.get('name') as string,
    bio: formData.get('bio') as string,
    location: formData.get('location') as string,
    website: formData.get('website') as string,
    twitter: formData.get('twitter') as string,
    github: formData.get('github') as string,
  };

  const parsed = updateUserProfileSchema.safeParse(data);
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name: parsed.data.name || null,
        bio: parsed.data.bio || null,
        location: parsed.data.location || null,
        website: parsed.data.website || null,
        twitter: parsed.data.twitter || null,
        github: parsed.data.github || null,
      },
    });

    revalidatePath('/dashboard/settings');
    revalidatePath('/dashboard/settings/profile');
    return { data: null, error: null };
  } catch (error) {
    logger.error('[updateUserProfile]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function uploadAvatar(formData: FormData) {
  const file = formData.get('avatar') as File;

  const parsed = fileSchema.safeParse({ file });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(parsed.data.file.type)) {
    return {
      data: null,
      error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed',
    };
  }

  // Validate file size
  if (parsed.data.file.size > FILE_LIMITS.MAX_IMAGE_SIZE) {
    return { data: null, error: 'File size must be less than 4.5MB' };
  }

  try {
    const session = await requireSession();
    const blob = await put(
      `avatars/${session.user.id}-${Date.now()}.${parsed.data.file.name.split('.').pop()}`,
      parsed.data.file,
      {
        access: 'public',
      }
    );

    await prisma.user.update({
      where: { id: session.user.id },
      data: { avatarUrl: blob.url },
    });

    revalidatePath('/dashboard/settings');
    revalidatePath('/dashboard/settings/profile');
    return { data: { url: blob.url }, error: null };
  } catch (error) {
    logger.error('[uploadAvatar]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function uploadBanner(formData: FormData) {
  const file = formData.get('banner') as File;

  const parsed = fileSchema.safeParse({ file });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(parsed.data.file.type)) {
    return {
      data: null,
      error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed',
    };
  }

  // Validate file size
  if (parsed.data.file.size > FILE_LIMITS.MAX_IMAGE_SIZE) {
    return { data: null, error: 'File size must be less than 4.5MB' };
  }

  try {
    const session = await requireSession();
    const blob = await put(
      `banners/${session.user.id}-${Date.now()}.${parsed.data.file.name.split('.').pop()}`,
      parsed.data.file,
      {
        access: 'public',
      }
    );

    await prisma.user.update({
      where: { id: session.user.id },
      data: { bannerUrl: blob.url },
    });

    revalidatePath('/dashboard/settings');
    revalidatePath('/dashboard/settings/profile');
    return { data: { url: blob.url }, error: null };
  } catch (error) {
    logger.error('[uploadBanner]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function getUserProfile(userId: string) {
  const parsed = userIdSchema.safeParse({ userId });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    const profile = await getPublicProfile(parsed.data.userId, session.user.id);

    if (!profile) {
      return { data: null, error: 'Profile not found or not accessible' };
    }

    return { data: profile, error: null };
  } catch (error) {
    logger.error('[getUserProfile]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function getUserThreadsAction(userId: string, limit?: number, offset?: number) {
  const parsed = paginationSchema.safeParse({ userId, limit, offset });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const result = await getUserThreads(
      parsed.data.userId,
      parsed.data.limit || 20,
      parsed.data.offset || 0
    );
    return { data: result, error: null };
  } catch (error) {
    logger.error('[getUserThreadsAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function updateProfilePrivacyAction(privacy: string) {
  const parsed = updateProfilePrivacySchema.safeParse({ privacy });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    await updateProfilePrivacy(session.user.id, parsed.data.privacy as ProfilePrivacy);
    revalidatePath('/dashboard/settings');
    revalidatePath(`/user/${session.user.id}`);
    return { data: null, error: null };
  } catch (error) {
    logger.error('[updateProfilePrivacyAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function updateUserPreferencesAction(preferences: Partial<UserPreferences>) {
  const parsed = updateUserPreferencesSchema.safeParse(preferences);
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { preferences: true },
    });

    const existingPrefs = parseUserPreferences(user?.preferences);
    const newPrefs: UserPreferences = {
      ...existingPrefs,
      ...parsed.data,
    };

    await prisma.user.update({
      where: { id: session.user.id },
      data: { preferences: newPrefs },
    });

    revalidatePath('/dashboard/settings');
    return { data: null, error: null };
  } catch (error) {
    logger.error('[updateUserPreferencesAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

'use server';

import { z } from 'zod';
import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import { put } from '@vercel/blob';
import { FILE_LIMITS } from '@/lib/config/constants';
import { getPublicProfile, getUserThreads, updateProfilePrivacy } from './repository';
import { ProfilePrivacy } from '@prisma/client';
import {
  updateUserProfileSchema,
  uploadAvatarSchema,
  uploadBannerSchema,
  updateProfilePrivacySchema,
  updateUserPreferencesSchema,
} from './schemas';
import { parseUserPreferences, type UserPreferences } from '@/lib/schemas/user-preferences';
import { createServerAction, withValidation } from '@/lib/utils/server-action';
import { paginationSchema } from '@/lib/utils/validation-common';

const fileSchema = z.object({
  file: z.custom<File>((val) => val instanceof File),
});

export const updateUserProfile = withValidation(
  z.object({
    name: z.string().optional(),
    bio: z.string().optional(),
    location: z.string().optional(),
    website: z.string().optional(),
    twitter: z.string().optional(),
    github: z.string().optional(),
  }),
  'updateUserProfile',
  async (data) => {
    const session = await requireSession();
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name: data.name || null,
        bio: data.bio || null,
        location: data.location || null,
        website: data.website || null,
        twitter: data.twitter || null,
        github: data.github || null,
      },
    });

    revalidatePath('/dashboard/settings');
    revalidatePath('/dashboard/settings/profile');
    return { data: null, error: null };
  }
);

export const uploadAvatar = withValidation(
  fileSchema,
  'uploadAvatar',
  async ({ file }) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return {
        data: null,
        error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed',
      };
    }

    if (file.size > FILE_LIMITS.MAX_IMAGE_SIZE) {
      return { data: null, error: 'File size must be less than 4.5MB' };
    }

    try {
      const session = await requireSession();
      const blob = await put(
        `avatars/${session.user.id}-${Date.now()}.${file.name.split('.').pop()}`,
        file,
        { access: 'public' }
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
);

export const uploadBanner = withValidation(
  fileSchema,
  'uploadBanner',
  async ({ file }) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return {
        data: null,
        error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed',
      };
    }

    if (file.size > FILE_LIMITS.MAX_IMAGE_SIZE) {
      return { data: null, error: 'File size must be less than 4.5MB' };
    }

    try {
      const session = await requireSession();
      const blob = await put(
        `banners/${session.user.id}-${Date.now()}.${file.name.split('.').pop()}`,
        file,
        { access: 'public' }
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
);

export const getUserProfile = createServerAction(
  { schema: z.object({ userId: z.string().cuid() }), actionName: 'getUserProfile' },
  async ({ userId }) => {
    const session = await requireSession();
    const profile = await getPublicProfile(userId, session.user.id);

    if (!profile) {
      return { data: null, error: 'Profile not found or not accessible' };
    }

    return { data: profile, error: null };
  }
);

export const getUserThreadsAction = withValidation(
  z.object({
    userId: z.string().cuid(),
    limit: z.number().int().positive().max(100).optional(),
    offset: z.number().int().nonnegative().optional(),
  }),
  'getUserThreadsAction',
  async ({ userId, limit, offset }) => {
    const result = await getUserThreads(userId, limit || 20, offset || 0);
    return { data: result, error: null };
  }
);

export const updateProfilePrivacyAction = withValidation(
  z.object({ privacy: z.nativeEnum(ProfilePrivacy) }),
  'updateProfilePrivacyAction',
  async ({ privacy }) => {
    const session = await requireSession();
    await updateProfilePrivacy(session.user.id, privacy);
    revalidatePath('/dashboard/settings');
    revalidatePath(`/user/${session.user.id}`);
    return { data: null, error: null };
  }
);

export const updateUserPreferencesAction = withValidation(
  updateUserPreferencesSchema,
  'updateUserPreferencesAction',
  async (preferences) => {
    const session = await requireSession();

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { preferences: true },
    });

    const existingPrefs = parseUserPreferences(user?.preferences);
    const newPrefs: UserPreferences = {
      ...existingPrefs,
      ...preferences,
    };

    await prisma.user.update({
      where: { id: session.user.id },
      data: { preferences: newPrefs },
    });

    revalidatePath('/dashboard/settings');
    return { data: null, error: null };
  }
);

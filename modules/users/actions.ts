'use server';

import { z } from 'zod';
import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import { put } from '@vercel/blob';
import { FILE_LIMITS } from '@/lib/config/constants';
import { detectMimeTypeFromFile, getExtensionFromMime } from '@/lib/utils/file-upload';
import { getPublicProfile, getUserThreads, updateProfilePrivacy } from './repository';
import { ProfilePrivacy } from '@prisma/client';
import { parseUserPreferences, type UserPreferences, userPreferencesSchema } from '@/lib/schemas/user-preferences';
import { createServerAction, withValidation } from '@/lib/utils/server-action';
import { actionFailure, actionSuccess } from '@/lib/actions/result';
import { paginationSchema, userIdSchema } from '@/lib/utils/validation-common';

const fileSchema = z.object({
  file: z.custom<File>((val) => val instanceof File),
});

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function revalidateProfilePaths() {
  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/settings/profile');
}

async function uploadProfileImage(
  file: File,
  folder: 'avatars' | 'banners',
  column: 'image' | 'bannerUrl',
  actionName: string
) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return actionFailure(
      'VALIDATION_ERROR',
      'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed'
    );
  }

  if (file.size > FILE_LIMITS.MAX_IMAGE_SIZE) {
    return actionFailure('VALIDATION_ERROR', 'File size must be less than 4.5MB');
  }

  // Sniff the real mime from magic bytes — file.type is client-supplied
  const detected = await detectMimeTypeFromFile(file);
  if (detected && !ALLOWED_IMAGE_TYPES.includes(detected)) {
    return actionFailure('VALIDATION_ERROR', 'File content does not match declared type');
  }

  try {
    const session = await requireSession();
    const ext = getExtensionFromMime(detected || file.type);
    const blob = await put(`${folder}/${session.user.id}-${Date.now()}.${ext}`, file, {
      access: 'public',
    });

    await prisma.user.update({
      where: { id: session.user.id },
      data: { [column]: blob.url },
    });

    revalidateProfilePaths();
    return actionSuccess({ url: blob.url });
  } catch (error) {
    logger.error(`[${actionName}]`, error);
    return actionFailure('INTERNAL_ERROR', 'Something went wrong');
  }
}

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

    revalidateProfilePaths();
    return actionSuccess(null);
  }
);

export const uploadAvatar = withValidation(fileSchema, 'uploadAvatar', ({ file }) =>
  uploadProfileImage(file, 'avatars', 'image', 'uploadAvatar')
);

export const uploadBanner = withValidation(fileSchema, 'uploadBanner', ({ file }) =>
  uploadProfileImage(file, 'banners', 'bannerUrl', 'uploadBanner')
);

export const getUserProfile = createServerAction(
  { schema: userIdSchema, actionName: 'getUserProfile' },
  async ({ userId }) => {
    const session = await requireSession();
    const profile = await getPublicProfile(userId, session.user.id);

    if (!profile) {
      return actionFailure('NOT_FOUND', 'Profile not found or not accessible');
    }

    return actionSuccess(profile);
  }
);

export const getUserThreadsAction = withValidation(
  userIdSchema.merge(paginationSchema),
  'getUserThreadsAction',
  async ({ userId, limit, offset }) => {
    const result = await getUserThreads(userId, limit || 20, offset || 0);
    return actionSuccess(result);
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
    return actionSuccess(null);
  }
);

export const updateUserPreferencesAction = withValidation(
  userPreferencesSchema.partial(),
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
      ...(preferences as Partial<UserPreferences>),
    };

    await prisma.user.update({
      where: { id: session.user.id },
      data: { preferences: newPrefs },
    });

    revalidatePath('/dashboard/settings');
    return actionSuccess(null);
  }
);

export const requestAccountDeletion = withValidation(
  z.object({ password: z.string().min(1, 'Password is required') }),
  'requestAccountDeletion',
  async ({ password }) => {
    const session = await requireSession();
    const userId = session.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      return actionFailure('NOT_FOUND', 'User not found');
    }

    // OAuth-only accounts have no credential row, so there's no password to verify
    const credentialAccount = await prisma.account.findFirst({
      where: { userId, providerId: 'credential' },
      select: { password: true },
    });

    if (credentialAccount?.password) {
      const { verifyPassword } = await import('better-auth/crypto');
      const valid = await verifyPassword({ password, hash: credentialAccount.password });
      if (!valid) {
        return actionFailure('VALIDATION_ERROR', 'Incorrect password');
      }
    }

    // Soft-delete + scrub PII, then detach authored content so threads and
    // messages survive as anonymous rather than cascading away
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          deletedAt: new Date(),
          status: 'SUSPENDED',
          email: `deleted-${userId}@sastram.com`,
          name: null,
          image: null,
          bio: null,
          location: null,
          website: null,
          github: null,
          twitter: null,
          avatarUrl: null,
          bannerUrl: null,
          preferences: {},
        },
      }),
      prisma.message.updateMany({
        where: { senderId: userId },
        data: { senderId: { set: null } },
      }),
      prisma.thread.updateMany({
        where: { createdBy: userId },
        data: { createdBy: { set: null } },
      }),
      prisma.report.updateMany({
        where: { reporterId: userId },
        data: { reporterId: { set: null } },
      }),
      prisma.appeal.updateMany({
        where: { moderatorId: userId },
        data: { moderatorId: { set: null } },
      }),
      prisma.userBan.updateMany({
        where: { userId: userId },
        data: { userId: { set: null } },
      }),
      prisma.userBan.updateMany({
        where: { bannedBy: userId },
        data: { bannedBy: { set: null } },
      }),
    ]);

    await prisma.session.deleteMany({ where: { userId } });

    return actionSuccess(null);
  }
);

export const exportUserData = createServerAction(
  { schema: z.object({}), actionName: 'exportUserData' },
  async () => {
    const session = await requireSession();
    const userId = session.user.id;

    const [user, messages, threads, invitations, reports, activities] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          bio: true,
          location: true,
          website: true,
          github: true,
          twitter: true,
          createdAt: true,
          lastSeenAt: true,
        },
      }),
      prisma.message.findMany({
        where: { senderId: userId },
        select: {
          id: true,
          content: true,
          createdAt: true,
          thread: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.thread.findMany({
        where: { createdBy: userId },
        select: { id: true, name: true, slug: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.threadInvitation.findMany({
        where: { email: session.user.email },
        select: {
          status: true,
          createdAt: true,
          thread: { select: { id: true, name: true, slug: true } },
        },
      }),
      prisma.report.findMany({
        where: { reporterId: userId },
        select: {
          id: true,
          category: true,
          status: true,
          details: true,
          createdAt: true,
        },
      }),
      prisma.userActivity.findMany({
        where: { userId },
        select: { type: true, entityType: true, entityId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    ]);

    return actionSuccess({
      profile: user,
      messages: messages.map((m) => ({
        id: m.id,
        content: m.content,
        createdAt: m.createdAt,
        threadName: m.thread.name,
        threadSlug: m.thread.slug,
      })),
      threads,
      invitations: invitations.map((m) => ({
        threadName: m.thread.name,
        threadSlug: m.thread.slug,
        status: m.status,
        createdAt: m.createdAt,
      })),
      reports,
      activities,
      exportedAt: new Date().toISOString(),
    });
  }
);

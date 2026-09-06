'use server';

import { z } from 'zod';
import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth';
import { revalidatePath } from 'next/cache';
import { AppError } from '@/lib/utils/errors';
import { store } from '@/lib/attachments';
import type { AttachmentKind } from '@/lib/attachments';
import { getPublicProfile, getUserThreads, updateProfilePrivacy } from './repository';
import { ProfilePrivacy, type Role } from '@prisma/client';
import { parseUserPreferences, type UserPreferences, userPreferencesSchema } from '@/lib/schemas/user-preferences';
import { createServerAction, withValidation } from '@/lib/utils/server-action';
import { actionFailure, actionSuccess, type ActionErrorCode } from '@/lib/actions/result';
import { paginationSchema, userIdSchema } from '@/lib/utils/validation-common';
import { verifyPassword } from 'better-auth/crypto';

const fileSchema = z.object({
  file: z.custom<File>((val) => val instanceof File),
});

// ── Shared select constants ────────────────────────────────────────────────
const USER_EXPORT_SELECT = {
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
} as const;

const MESSAGE_EXPORT_SELECT = {
  id: true,
  content: true,
  createdAt: true,
  thread: { select: { id: true, name: true, slug: true } },
} as const;

const THREAD_EXPORT_SELECT = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
} as const;

const INVITATION_EXPORT_SELECT = {
  status: true,
  createdAt: true,
  thread: { select: { id: true, name: true, slug: true } },
} as const;

const REPORT_EXPORT_SELECT = {
  id: true,
  category: true,
  status: true,
  details: true,
  createdAt: true,
} as const;

const ACTIVITY_EXPORT_SELECT = {
  type: true,
  entityType: true,
  entityId: true,
  createdAt: true,
} as const;

// ── Revalidation helpers ───────────────────────────────────────────────────
function revalidateSettingsPaths(userId?: string) {
  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/settings/profile');
  if (userId) {
    revalidatePath(`/user/${userId}`);
  }
}

function revalidateProfilePaths() {
  revalidateSettingsPaths();
}

function revalidatePrivacyPaths(userId: string) {
  revalidateSettingsPaths(userId);
}

function toActionErrorCode(code: string | undefined): ActionErrorCode {
  switch (code) {
    case 'AUTH_REQUIRED':
    case 'FORBIDDEN':
    case 'VALIDATION_ERROR':
    case 'NOT_FOUND':
    case 'RATE_LIMITED':
    case 'CONFLICT':
    case 'INTERNAL_ERROR':
      return code;
    default:
      return 'INTERNAL_ERROR';
  }
}

function buildProfileUpdateData(data: { name?: string; bio?: string; location?: string; website?: string; twitter?: string; github?: string }) {
  return {
    name: data.name || null,
    bio: data.bio || null,
    location: data.location || null,
    website: data.website || null,
    twitter: data.twitter || null,
    github: data.github || null,
  };
}

function resolveAttachmentKind(folder: 'avatars' | 'banners'): AttachmentKind {
  return folder === 'avatars' ? 'avatar' : 'banner';
}

async function uploadProfileImage(
  file: File,
  folder: 'avatars' | 'banners',
  column: 'image' | 'bannerUrl',
  actionName: string
) {
  try {
    const session = await requireSession();
    const kind = resolveAttachmentKind(folder);
    const [stored] = await store([file], { kind });

    await prisma.user.update({
      where: { id: session.user.id },
      data: { [column]: stored.url },
    });

    revalidateProfilePaths();
    return actionSuccess({ url: stored.url });
  } catch (error) {
    if (AppError.isAppError(error)) {
      const errorCode = toActionErrorCode(error.code);
      return actionFailure(errorCode, error.message);
    }
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
    const updateData = buildProfileUpdateData(data);
    await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
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
    const session = await requireSession();
    const result = await getUserThreads(userId, limit || 20, offset || 0, session.user.id, session.user.role as Role);
    return actionSuccess(result);
  }
);

export const updateProfilePrivacyAction = withValidation(
  z.object({ privacy: z.nativeEnum(ProfilePrivacy) }),
  'updateProfilePrivacyAction',
  async ({ privacy }) => {
    const session = await requireSession();
    await updateProfilePrivacy(session.user.id, privacy);
    revalidatePrivacyPaths(session.user.id);
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
    const incomingPrefs = preferences as Partial<UserPreferences>;
    const newPrefs: UserPreferences = {
      ...existingPrefs,
      ...incomingPrefs,
    };

    await prisma.user.update({
      where: { id: session.user.id },
      data: { preferences: newPrefs },
    });

    revalidateSettingsPaths();
    return actionSuccess(null);
  }
);

// ── Account deletion helpers ───────────────────────────────────────────────
async function validateDeletionPassword(userId: string, password: string) {
  const credentialAccount = await prisma.account.findFirst({
    where: { userId, providerId: 'credential' },
    select: { password: true },
  });

  if (credentialAccount?.password) {
    const valid = await verifyPassword({ password, hash: credentialAccount.password });
    if (!valid) {
      return actionFailure('VALIDATION_ERROR', 'Incorrect password');
    }
  }
  return null;
}

function buildSoftDeleteTransaction(userId: string) {
  return [
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
    prisma.message.updateMany({ where: { senderId: userId }, data: { senderId: { set: null } } }),
    prisma.thread.updateMany({ where: { createdBy: userId }, data: { createdBy: { set: null } } }),
    prisma.report.updateMany({ where: { reporterId: userId }, data: { reporterId: { set: null } } }),
    prisma.appeal.updateMany({ where: { moderatorId: userId }, data: { moderatorId: { set: null } } }),
    prisma.appealVote.deleteMany({ where: { moderatorId: userId } }),
    prisma.appeal.updateMany({ where: { userId }, data: { userId: { set: null } } }),
    prisma.userBan.updateMany({ where: { userId: userId }, data: { userId: { set: null } } }),
    prisma.userBan.updateMany({ where: { bannedBy: userId }, data: { bannedBy: { set: null } } }),
    prisma.session.deleteMany({ where: { userId } }),
  ];
}

export const requestAccountDeletion = withValidation(
  z.object({ password: z.string().min(1, 'Password is required') }),
  'requestAccountDeletion',
  async ({ password }) => {
    const session = await requireSession();
    const userId = session.user.id;

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      return actionFailure('NOT_FOUND', 'User not found');
    }

    const passwordError = await validateDeletionPassword(userId, password);
    if (passwordError) return passwordError;

    await prisma.$transaction(buildSoftDeleteTransaction(userId));

    return actionSuccess(null);
  }
);

// ── Export helpers ─────────────────────────────────────────────────────────
async function fetchUserExportData(userId: string, email: string | null) {
  return Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: USER_EXPORT_SELECT }),
    prisma.message.findMany({ where: { senderId: userId }, select: MESSAGE_EXPORT_SELECT, orderBy: { createdAt: 'desc' } }),
    prisma.thread.findMany({ where: { createdBy: userId }, select: THREAD_EXPORT_SELECT, orderBy: { createdAt: 'desc' } }),
    prisma.threadInvitation.findMany({ where: { email: email ?? '' }, select: INVITATION_EXPORT_SELECT }),
    prisma.report.findMany({ where: { reporterId: userId }, select: REPORT_EXPORT_SELECT }),
    prisma.userActivity.findMany({ where: { userId }, select: ACTIVITY_EXPORT_SELECT, orderBy: { createdAt: 'desc' }, take: 500 }),
  ]);
}

function mapExportMessages(messages: Awaited<ReturnType<typeof fetchUserExportData>>[1]) {
  return messages.map((m) => ({
    id: m.id,
    content: m.content,
    createdAt: m.createdAt,
    threadName: m.thread.name,
    threadSlug: m.thread.slug,
  }));
}

function mapExportInvitations(invitations: Awaited<ReturnType<typeof fetchUserExportData>>[3]) {
  return invitations.map((m) => ({
    threadName: m.thread.name,
    threadSlug: m.thread.slug,
    status: m.status,
    createdAt: m.createdAt,
  }));
}

export const exportUserData = createServerAction(
  { schema: z.object({}), actionName: 'exportUserData' },
  async () => {
    const session = await requireSession();
    const userId = session.user.id;

    const [user, messages, threads, invitations, reports, activities] = await fetchUserExportData(userId, session.user.email);

    return actionSuccess({
      profile: user,
      messages: mapExportMessages(messages),
      threads,
      invitations: mapExportInvitations(invitations),
      reports,
      activities,
      exportedAt: new Date().toISOString(),
    });
  }
);

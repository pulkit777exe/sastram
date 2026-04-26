'use server';

import { z } from 'zod';
import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession, assertAdmin } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import { buildThreadSlug } from '@/lib/utils/slug';
import {
  createThread,
  deleteThread,
  listThreads,
  getThreadMembers,
  updateThreadMemberRole,
  removeThreadMember,
  updateThreadDNA,
  updateResolutionScore,
  updateThreadStaleness,
} from './repository';
import { SectionRole } from '@prisma/client';
import { createServerAction } from '@/lib/utils/server-action';
import { threadIdSchema } from '@/lib/utils/validation-common';

const threadSchema = z.object({
  title: z.string().min(3),
  description: z.string().max(480).optional().or(z.literal('')),
  communityId: z.string().cuid().optional().or(z.literal('')),
  initialMessage: z.string().optional(),
});

const manageMemberSchema = z.object({
  threadId: z.string().cuid(),
  userId: z.string().cuid(),
  action: z.enum(['update_role', 'remove']),
  role: z.nativeEnum(SectionRole).optional(),
});

export const createThreadAction = createServerAction(
  { schema: threadSchema, actionName: 'createThreadAction' },
  async ({ title, description, communityId, initialMessage }) => {
    try {
      const session = await requireSession();
      assertAdmin(session.user);

      const slug = buildThreadSlug(title);
      await createThread({
        name: title,
        description,
        communityId: communityId || null,
        slug,
        createdBy: session.user.id,
        initialMessage,
      });

      revalidatePath('/dashboard');
      return { data: null, error: null };
    } catch (error) {
      logger.error('[createThreadAction]', error);
      return { data: null, error: 'Something went wrong' };
    }
  }
);

export const deleteThreadAction = createServerAction(
  { schema: threadIdSchema, actionName: 'deleteThreadAction' },
  async ({ threadId }) => {
    try {
      const session = await requireSession();
      assertAdmin(session.user);

      await deleteThread(threadId);
      revalidatePath('/dashboard');
      return { data: null, error: null };
    } catch (error) {
      logger.error('[deleteThreadAction]', error);
      return { data: null, error: 'Something went wrong' };
    }
  }
);

export const getDashboardThreads = createServerAction(
  {
    schema: z.object({
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().max(100).optional(),
      sortBy: z.enum(['recent', 'popular', 'trending', 'oldest']).optional(),
    }),
    actionName: 'getDashboardThreads',
  },
  async (params) => {
    try {
      const result = await listThreads(params);
      return { data: result, error: null };
    } catch (error) {
      logger.error('[getDashboardThreads]', error);
      return { data: null, error: 'Something went wrong' };
    }
  }
);

export const getThreadMembersAction = createServerAction(
  { schema: threadIdSchema, actionName: 'getThreadMembersAction' },
  async ({ threadId }) => {
    try {
      await requireSession();
      const members = await getThreadMembers(threadId);
      return { data: members, error: null };
    } catch (error) {
      logger.error('[getThreadMembersAction]', error);
      return { data: null, error: 'Something went wrong' };
    }
  }
);

export const manageThreadMemberAction = createServerAction(
  { schema: manageMemberSchema, actionName: 'manageThreadMemberAction' },
  async ({ threadId, userId, action, role }) => {
    try {
      const session = await requireSession();

      const thread = await prisma.section.findUnique({
        where: { id: threadId },
        select: { createdBy: true, slug: true },
      });

      if (!thread) {
        return { data: null, error: 'Something went wrong' };
      }

      const isCreator = thread.createdBy === session.user.id;

      if (!isCreator) {
        try {
          assertAdmin(session.user);
        } catch {
          return { data: null, error: 'Something went wrong' };
        }
      }

      if (userId === session.user.id) {
        return { data: null, error: 'Something went wrong' };
      }

      if (action === 'update_role') {
        if (!role) {
          return { data: null, error: 'Invalid input' };
        }
        await updateThreadMemberRole(threadId, userId, role);
      } else if (action === 'remove') {
        await removeThreadMember(threadId, userId);
      }

      revalidatePath(`/dashboard/threads/thread/${thread.slug}`);
      return { data: null, error: null };
    } catch (error) {
      logger.error('[manageThreadMemberAction]', error);
      return { data: null, error: 'Something went wrong' };
    }
  }
);

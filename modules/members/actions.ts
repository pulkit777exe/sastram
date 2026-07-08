'use server';

import { z } from 'zod';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import { ThreadRole } from '@prisma/client';
import {
  addMember,
  removeMember,
  updateMemberRole,
  getThreadMembers,
  getMemberRole,
} from '@/modules/members/repository';
import { createNotification } from '@/modules/notifications';
import { createServerAction } from '@/lib/utils/server-action';
import { AppError } from '@/lib/utils/errors';

const joinSectionSchema = z.object({
  threadId: z.string().cuid(),
});

const leaveSectionSchema = z.object({
  threadId: z.string().cuid(),
});

const inviteMemberSchema = z.object({
  threadId: z.string().cuid(),
  email: z.string().email(),
  role: z.nativeEnum(ThreadRole).optional().default('MEMBER'),
});

const updateMemberRoleSchema = z.object({
  threadId: z.string().cuid(),
  userId: z.string().cuid(),
  role: z.nativeEnum(ThreadRole),
});

const removeMemberSchema = z.object({
  threadId: z.string().cuid(),
  userId: z.string().cuid(),
});

const getSectionMembersSchema = z.object({
  threadId: z.string().cuid(),
});

export const joinSection = createServerAction(
  { schema: joinSectionSchema, actionName: 'joinSection' },
  async ({ threadId }) => {
    const session = await requireSession();

    await prisma.$transaction(async (tx) => {
      const existing = await tx.threadMember.findUnique({
        where: { threadId_userId: { threadId, userId: session.user.id } },
      });

      if (existing?.status === 'ACTIVE') {
        throw new AppError('Already a member', 'ALREADY_MEMBER');
      }

      if (existing) {
        await tx.threadMember.update({
          where: { threadId_userId: { threadId, userId: session.user.id } },
          data: { status: 'ACTIVE', role: 'MEMBER' },
        });
      } else {
        await tx.threadMember.create({
          data: {
            threadId,
            userId: session.user.id,
            role: 'MEMBER',
            status: 'ACTIVE',
          },
        });
      }

      await tx.thread.update({
        where: { id: threadId },
        data: { memberCount: { increment: 1 } },
      });
    });

    revalidatePath('/dashboard/threads');
    return { data: null, error: null };
  }
);

export const leaveSection = createServerAction(
  { schema: leaveSectionSchema, actionName: 'leaveSection' },
  async ({ threadId }) => {
    const session = await requireSession();

    const affected = await prisma.$transaction(async (tx) => {
      const existing = await tx.threadMember.findUnique({
        where: { threadId_userId: { threadId, userId: session.user.id } },
      });

      if (!existing || existing.status !== 'ACTIVE') {
        return false;
      }

      await tx.threadMember.update({
        where: { threadId_userId: { threadId, userId: session.user.id } },
        data: { status: 'LEFT' },
      });

      await tx.thread.update({
        where: { id: threadId },
        data: { memberCount: { decrement: 1 } },
      });

      return true;
    });

    if (!affected) {
      return { data: null, error: 'You are not an active member' };
    }

    revalidatePath('/dashboard/threads');
    return { data: null, error: null };
  }
);

export const inviteMember = createServerAction(
  { schema: inviteMemberSchema, actionName: 'inviteMember' },
  async ({ threadId, email, role }) => {
    const session = await requireSession();
    const memberRole = await getMemberRole(threadId, session.user.id);
    if (!memberRole || !['OWNER', 'MODERATOR'].includes(memberRole.role)) {
      return { data: null, error: 'Insufficient permissions' };
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return { data: null, error: 'User not found' };
    }

    await addMember(threadId, user.id, role);

    await createNotification({
      userId: user.id,
      type: 'INVITATION',
      title: 'Section Invitation',
      message: "You've been invited to join a section",
    });

    revalidatePath('/dashboard/threads');
    return { data: null, error: null };
  }
);

export const updateMemberRoleAction = createServerAction(
  { schema: updateMemberRoleSchema, actionName: 'updateMemberRoleAction' },
  async ({ threadId, userId, role }) => {
    const session = await requireSession();
    const memberRole = await getMemberRole(threadId, session.user.id);
    if (!memberRole || memberRole.role !== 'OWNER') {
      return { data: null, error: 'Only section owners can change roles' };
    }

    await updateMemberRole(threadId, userId, role);
    revalidatePath('/dashboard/threads');
    return { data: null, error: null };
  }
);

export const removeMemberAction = createServerAction(
  { schema: removeMemberSchema, actionName: 'removeMemberAction' },
  async ({ threadId, userId }) => {
    const session = await requireSession();
    const memberRole = await getMemberRole(threadId, session.user.id);
    if (!memberRole || !['OWNER', 'MODERATOR'].includes(memberRole.role)) {
      return { data: null, error: 'Insufficient permissions' };
    }

    const affected = await prisma.$transaction(async (tx) => {
      const existing = await tx.threadMember.findUnique({
        where: { threadId_userId: { threadId, userId } },
      });

      if (!existing || existing.status !== 'ACTIVE') {
        return false;
      }

      await tx.threadMember.update({
        where: { threadId_userId: { threadId, userId } },
        data: { status: 'LEFT' },
      });

      await tx.thread.update({
        where: { id: threadId },
        data: { memberCount: { decrement: 1 } },
      });

      return true;
    });

    if (!affected) {
      return { data: null, error: 'User is not an active member' };
    }

    revalidatePath('/dashboard/threads');
    return { data: null, error: null };
  }
);

export const getSectionMembersAction = createServerAction(
  { schema: getSectionMembersSchema, actionName: 'getSectionMembersAction' },
  async ({ threadId }) => {
    const members = await getThreadMembers(threadId);
    return { data: members, error: null };
  }
);

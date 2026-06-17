'use server';

import { z } from 'zod';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth';
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
import { ROUTES } from '@/lib/config/routes';
import { createServerAction } from '@/lib/utils/server-action';

const joinThreadSchema = z.object({
  threadId: z.string().cuid(),
});

const leaveThreadSchema = z.object({
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

const getThreadMembersSchema = z.object({
  threadId: z.string().cuid(),
});

export const joinThread = createServerAction(
  { schema: joinThreadSchema, actionName: 'joinThread' },
  async ({ threadId }) => {
    const session = await requireSession();
    const existing = await getMemberRole(threadId, session.user.id);
    if (existing && existing.status === 'ACTIVE') {
      return { data: null, error: 'Already a member', ok: false, errorCode: 'CONFLICT' };
    }

    await addMember(threadId, session.user.id, 'MEMBER');

    await prisma.thread.update({
      where: { id: threadId },
      data: { memberCount: { increment: 1 } },
    });

    revalidatePath(ROUTES.DASHBOARD_THREADS);
    return { data: null, error: null, ok: true, errorCode: null };
  }
);

export const leaveThread = createServerAction(
  { schema: leaveThreadSchema, actionName: 'leaveThread' },
  async ({ threadId }) => {
    const session = await requireSession();
    const result = await removeMember(threadId, session.user.id);

    if (result.count > 0) {
      await prisma.thread.update({
        where: { id: threadId },
        data: { memberCount: { decrement: 1 } },
      });
    }

    revalidatePath(ROUTES.DASHBOARD_THREADS);
    return { data: null, error: null, ok: true, errorCode: null };
  }
);

export const inviteMember = createServerAction(
  { schema: inviteMemberSchema, actionName: 'inviteMember' },
  async ({ threadId, email, role }) => {
    const session = await requireSession();
    const memberRole = await getMemberRole(threadId, session.user.id);
    if (!memberRole || !['OWNER', 'MODERATOR'].includes(memberRole.role)) {
      return { data: null, error: 'Insufficient permissions', ok: false, errorCode: 'FORBIDDEN' };
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return { data: null, error: 'User not found', ok: false, errorCode: 'NOT_FOUND' };
    }

    await addMember(threadId, user.id, role);

    await createNotification({
      userId: user.id,
      type: 'INVITATION',
      title: 'Thread Invitation',
      message: "You've been invited to join a thread",
    });

    revalidatePath(ROUTES.DASHBOARD_THREADS);
    return { data: null, error: null, ok: true, errorCode: null };
  }
);

export const updateMemberRoleAction = createServerAction(
  { schema: updateMemberRoleSchema, actionName: 'updateMemberRoleAction' },
  async ({ threadId, userId, role }) => {
    const session = await requireSession();
    const memberRole = await getMemberRole(threadId, session.user.id);
    if (!memberRole || memberRole.role !== 'OWNER') {
      return { data: null, error: 'Only thread owners can change roles', ok: false, errorCode: 'FORBIDDEN' };
    }

    await updateMemberRole(threadId, userId, role);
    revalidatePath(ROUTES.DASHBOARD_THREADS);
    return { data: null, error: null, ok: true, errorCode: null };
  }
);

export const removeMemberAction = createServerAction(
  { schema: removeMemberSchema, actionName: 'removeMemberAction' },
  async ({ threadId, userId }) => {
    const session = await requireSession();
    const memberRole = await getMemberRole(threadId, session.user.id);
    if (!memberRole || !['OWNER', 'MODERATOR'].includes(memberRole.role)) {
      return { data: null, error: 'Insufficient permissions', ok: false, errorCode: 'FORBIDDEN' };
    }

    const result = await removeMember(threadId, userId);

    if (result.count > 0) {
      await prisma.thread.update({
        where: { id: threadId },
        data: { memberCount: { decrement: 1 } },
      });
    }

    revalidatePath(ROUTES.DASHBOARD_THREADS);
    return { data: null, error: null, ok: true, errorCode: null };
  }
);

export const getThreadMembersAction = createServerAction(
  { schema: getThreadMembersSchema, actionName: 'getThreadMembersAction' },
  async ({ threadId }) => {
    await requireSession();
    const members = await getThreadMembers(threadId);
    return { data: members, error: null, ok: true, errorCode: null };
  }
);

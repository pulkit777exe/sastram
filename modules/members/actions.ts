'use server';

import { z } from 'zod';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import { SectionRole } from '@prisma/client';
import {
  addMember,
  removeMember,
  updateMemberRole,
  getSectionMembers,
  getMemberRole,
} from '@/modules/members/repository';
import { createNotification } from '@/modules/notifications/repository';
import { createServerAction } from '@/lib/utils/server-action';

const joinSectionSchema = z.object({
  sectionId: z.string().cuid(),
});

const leaveSectionSchema = z.object({
  sectionId: z.string().cuid(),
});

const inviteMemberSchema = z.object({
  sectionId: z.string().cuid(),
  email: z.string().email(),
  role: z.nativeEnum(SectionRole).optional().default('MEMBER'),
});

const updateMemberRoleSchema = z.object({
  sectionId: z.string().cuid(),
  userId: z.string().cuid(),
  role: z.nativeEnum(SectionRole),
});

const removeMemberSchema = z.object({
  sectionId: z.string().cuid(),
  userId: z.string().cuid(),
});

const getSectionMembersSchema = z.object({
  sectionId: z.string().cuid(),
});

export const joinSection = createServerAction(
  { schema: joinSectionSchema, actionName: 'joinSection', requireAuth: true },
  async ({ sectionId }) => {
    const session = await requireSession();
    const existing = await getMemberRole(sectionId, session.user.id);
    if (existing && existing.status === 'ACTIVE') {
      return { data: null, error: 'Already a member' };
    }

    await addMember(sectionId, session.user.id, 'MEMBER');

    await prisma.section.update({
      where: { id: sectionId },
      data: { memberCount: { increment: 1 } },
    });

    revalidatePath('/dashboard/threads');
    return { data: null, error: null };
  }
);

export const leaveSection = createServerAction(
  { schema: leaveSectionSchema, actionName: 'leaveSection', requireAuth: true },
  async ({ sectionId }) => {
    const session = await requireSession();
    await removeMember(sectionId, session.user.id);

    await prisma.section.update({
      where: { id: sectionId },
      data: { memberCount: { decrement: 1 } },
    });

    revalidatePath('/dashboard/threads');
    return { data: null, error: null };
  }
);

export const inviteMember = createServerAction(
  { schema: inviteMemberSchema, actionName: 'inviteMember' },
  async ({ sectionId, email, role }) => {
    const session = await requireSession();
    const memberRole = await getMemberRole(sectionId, session.user.id);
    if (!memberRole || !['OWNER', 'MODERATOR'].includes(memberRole.role)) {
      return { data: null, error: 'Insufficient permissions' };
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return { data: null, error: 'User not found' };
    }

    await addMember(sectionId, user.id, role);

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
  async ({ sectionId, userId, role }) => {
    const session = await requireSession();
    const memberRole = await getMemberRole(sectionId, session.user.id);
    if (!memberRole || memberRole.role !== 'OWNER') {
      return { data: null, error: 'Only section owners can change roles' };
    }

    await updateMemberRole(sectionId, userId, role);
    revalidatePath('/dashboard/threads');
    return { data: null, error: null };
  }
);

export const removeMemberAction = createServerAction(
  { schema: removeMemberSchema, actionName: 'removeMemberAction' },
  async ({ sectionId, userId }) => {
    const session = await requireSession();
    const memberRole = await getMemberRole(sectionId, session.user.id);
    if (!memberRole || !['OWNER', 'MODERATOR'].includes(memberRole.role)) {
      return { data: null, error: 'Insufficient permissions' };
    }

    await removeMember(sectionId, userId);

    await prisma.section.update({
      where: { id: sectionId },
      data: { memberCount: { decrement: 1 } },
    });

    revalidatePath('/dashboard/threads');
    return { data: null, error: null };
  }
);

export const getSectionMembersAction = createServerAction(
  { schema: getSectionMembersSchema, actionName: 'getSectionMembersAction' },
  async ({ sectionId }) => {
    const members = await getSectionMembers(sectionId);
    return { data: members, error: null };
  }
);

'use server';

import { logger } from '@/lib/infrastructure/logger';

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
import {
  joinSectionSchema,
  leaveSectionSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  removeMemberSchema,
  getSectionMembersSchema,
} from './schemas';

export async function joinSection(sectionId: string) {
  const parsed = joinSectionSchema.safeParse({ sectionId });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    // Check if already a member
    const existing = await getMemberRole(parsed.data.sectionId, session.user.id);
    if (existing && existing.status === 'ACTIVE') {
      return { data: null, error: 'Already a member' };
    }

    await addMember(parsed.data.sectionId, session.user.id, 'MEMBER');

    // Update member count
    await prisma.section.update({
      where: { id: parsed.data.sectionId },
      data: {
        memberCount: {
          increment: 1,
        },
      },
    });

    revalidatePath('/dashboard/threads');
    return { data: null, error: null };
  } catch (error) {
    logger.error('[joinSection]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function leaveSection(sectionId: string) {
  const parsed = leaveSectionSchema.safeParse({ sectionId });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    await removeMember(parsed.data.sectionId, session.user.id);

    // Update member count
    await prisma.section.update({
      where: { id: parsed.data.sectionId },
      data: {
        memberCount: {
          decrement: 1,
        },
      },
    });

    revalidatePath('/dashboard/threads');
    return { data: null, error: null };
  } catch (error) {
    logger.error('[leaveSection]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function inviteMember(sectionId: string, email: string, role: SectionRole = 'MEMBER') {
  const parsed = inviteMemberSchema.safeParse({ sectionId, email, role });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    // Check if user has permission (must be owner or moderator)
    const memberRole = await getMemberRole(parsed.data.sectionId, session.user.id);
    if (!memberRole || !['OWNER', 'MODERATOR'].includes(memberRole.role)) {
      return { data: null, error: 'Insufficient permissions' };
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    });

    if (!user) {
      return { data: null, error: 'User not found' };
    }

    // Add as member
    await addMember(parsed.data.sectionId, user.id, parsed.data.role);

    // Create notification
    await createNotification({
      userId: user.id,
      type: 'INVITATION',
      title: 'Section Invitation',
      message: `You've been invited to join a section`,
    });

    revalidatePath('/dashboard/threads');
    return { data: null, error: null };
  } catch (error) {
    logger.error('[inviteMember]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function updateMemberRoleAction(sectionId: string, userId: string, role: SectionRole) {
  const parsed = updateMemberRoleSchema.safeParse({ sectionId, userId, role });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    // Check if user has permission (must be owner)
    const memberRole = await getMemberRole(parsed.data.sectionId, session.user.id);
    if (!memberRole || memberRole.role !== 'OWNER') {
      return { data: null, error: 'Only section owners can change roles' };
    }

    await updateMemberRole(parsed.data.sectionId, parsed.data.userId, parsed.data.role);

    revalidatePath('/dashboard/threads');
    return { data: null, error: null };
  } catch (error) {
    logger.error('[updateMemberRoleAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function removeMemberAction(sectionId: string, userId: string) {
  const parsed = removeMemberSchema.safeParse({ sectionId, userId });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    // Check if user has permission (must be owner or moderator)
    const memberRole = await getMemberRole(parsed.data.sectionId, session.user.id);
    if (!memberRole || !['OWNER', 'MODERATOR'].includes(memberRole.role)) {
      return { data: null, error: 'Insufficient permissions' };
    }

    await removeMember(parsed.data.sectionId, parsed.data.userId);

    // Update member count
    await prisma.section.update({
      where: { id: parsed.data.sectionId },
      data: {
        memberCount: {
          decrement: 1,
        },
      },
    });

    revalidatePath('/dashboard/threads');
    return { data: null, error: null };
  } catch (error) {
    logger.error('[removeMemberAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function getSectionMembersAction(sectionId: string) {
  const parsed = getSectionMembersSchema.safeParse({ sectionId });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const members = await getSectionMembers(parsed.data.sectionId);
    return { data: members, error: null };
  } catch (error) {
    logger.error('[getSectionMembersAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

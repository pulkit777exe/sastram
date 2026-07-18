'use server';

import { z } from 'zod';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import { createNotification } from '@/modules/notifications';
import { createServerAction } from '@/lib/utils/server-action';
import { canManageThread } from '@/lib/thread-access';

const threadIdSchema = z.object({
  threadId: z.string().cuid(),
});

const inviteMemberSchema = z.object({
  threadId: z.string().cuid(),
  email: z.string().email(),
});

const targetMemberSchema = z.object({
  threadId: z.string().cuid(),
  userId: z.string().cuid(),
});

export const joinSection = createServerAction(
  { schema: threadIdSchema, actionName: 'joinSection' },
  async () => ({ data: null, error: null })
);

export const leaveSection = createServerAction(
  { schema: threadIdSchema, actionName: 'leaveSection' },
  async () => ({ data: null, error: null })
);

export const inviteMember = createServerAction(
  { schema: inviteMemberSchema, actionName: 'inviteMember' },
  async ({ threadId, email }) => {
    const session = await requireSession();
    const thread = await prisma.thread.findFirst({
      where: { id: threadId, deletedAt: null },
      select: { id: true, slug: true, createdBy: true, visibility: true },
    });

    if (!thread || !canManageThread({ threadId: thread.id, createdBy: thread.createdBy, visibility: thread.visibility }, session.user.id, session.user.role)) {
      return { data: null, error: 'Insufficient permissions' };
    }

    const invitation = await prisma.threadInvitation.upsert({
      where: { threadId_email: { threadId, email } },
      update: { status: 'PENDING', senderId: session.user.id },
      create: { threadId, email, senderId: session.user.id },
    });

    const user = await prisma.user.findUnique({
      where: { email, deletedAt: null },
      select: { id: true },
    });

    if (user) {
      await createNotification({
        userId: user.id,
        type: 'INVITATION',
        title: 'Thread invitation',
        message: "You've been invited to a private thread.",
      });
    }

    revalidatePath(`/thread/${thread.slug}`);
    return { data: invitation, error: null };
  }
);

export const updateMemberRoleAction = createServerAction(
  { schema: targetMemberSchema, actionName: 'updateMemberRoleAction' },
  async () => ({ data: null, error: 'Thread roles were removed; use invitations for access.' })
);

export const removeMemberAction = createServerAction(
  { schema: targetMemberSchema, actionName: 'removeMemberAction' },
  async ({ threadId, userId }) => {
    const session = await requireSession();
    const thread = await prisma.thread.findFirst({
      where: { id: threadId, deletedAt: null },
      select: { id: true, slug: true, createdBy: true, visibility: true },
    });

    if (!thread || !canManageThread({ threadId: thread.id, createdBy: thread.createdBy, visibility: thread.visibility }, session.user.id, session.user.role)) {
      return { data: null, error: 'Insufficient permissions' };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      return { data: null, error: 'User not found' };
    }

    await prisma.threadInvitation.deleteMany({
      where: { threadId, email: user.email },
    });

    revalidatePath(`/thread/${thread.slug}`);
    return { data: null, error: null };
  }
);

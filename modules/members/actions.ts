'use server';

import { z } from 'zod';
import type { Role } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth';
import { revalidatePath } from 'next/cache';
import { createNotification } from '@/modules/notifications';
import { createServerAction } from '@/lib/utils/server-action';
import { actionFailure, actionSuccess } from '@/lib/actions/result';
import { canManageThread } from '@/lib/thread-access';
import { threadIdSchema, userIdSchema } from '@/lib/utils/validation-common';

const inviteMemberSchema = threadIdSchema.extend({
  email: z.string().email(),
});

const targetMemberSchema = threadIdSchema.merge(userIdSchema);

async function findManageableThread(threadId: string, userId: string, role: Role) {
  const thread = await prisma.thread.findFirst({
    where: { id: threadId, deletedAt: null },
    select: { id: true, slug: true, createdBy: true, visibility: true },
  });

  if (!thread) return null;

  const manageable = canManageThread(
    { threadId: thread.id, createdBy: thread.createdBy, visibility: thread.visibility },
    userId,
    role
  );

  return manageable ? thread : null;
}

export const inviteMember = createServerAction(
  { schema: inviteMemberSchema, actionName: 'inviteMember' },
  async ({ threadId, email }) => {
    const session = await requireSession();
    const thread = await findManageableThread(threadId, session.user.id, session.user.role);

    if (!thread) {
      return actionFailure('FORBIDDEN', 'Insufficient permissions');
    }

    const invitation = await prisma.threadInvitation.upsert({
      where: { threadId_email: { threadId, email } },
      update: { status: 'PENDING', senderId: session.user.id },
      create: { threadId, email, senderId: session.user.id },
    });

    // Invites are keyed by email, so the invitee may not have an account yet
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

    revalidatePath(`/dashboard/threads/${thread.slug}`);
    return actionSuccess(invitation);
  }
);

export const removeMemberAction = createServerAction(
  { schema: targetMemberSchema, actionName: 'removeMemberAction' },
  async ({ threadId, userId }) => {
    const session = await requireSession();
    const thread = await findManageableThread(threadId, session.user.id, session.user.role);

    if (!thread) {
      return actionFailure('FORBIDDEN', 'Insufficient permissions');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      return actionFailure('NOT_FOUND', 'User not found');
    }

    // Access is invitation-derived, so revoking means deleting the invitation row
    await prisma.threadInvitation.deleteMany({
      where: { threadId, email: user.email },
    });

    revalidatePath(`/dashboard/threads/${thread.slug}`);
    return actionSuccess(null);
  }
);

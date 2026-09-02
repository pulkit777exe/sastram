'use server';

import { z } from 'zod';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth';
import { revalidatePath } from 'next/cache';
import { dispatch } from '@/modules/notifications/dispatcher';
import { createServerAction } from '@/lib/utils/server-action';
import { actionFailure, actionSuccess } from '@/lib/actions/result';
import { threadIdSchema, userIdSchema } from '@/lib/utils/validation-common';
import {
  createInvitation,
  findManageableThread,
  findThreadById,
  removeMemberInvitations,
} from '@/modules/invitations/repository';

const inviteMemberSchema = threadIdSchema.extend({
  email: z.string().email(),
});

const targetMemberSchema = threadIdSchema.merge(userIdSchema);

export const inviteMember = createServerAction(
  { schema: inviteMemberSchema, actionName: 'inviteMember' },
  async ({ threadId, email }) => {
    const session = await requireSession();
    const thread = await findManageableThread(threadId, session.user.id, session.user.role);

    if (!thread) {
      const exists = await findThreadById(threadId);
      if (!exists) return actionFailure('NOT_FOUND', 'Thread not found');
      return actionFailure('FORBIDDEN', 'Insufficient permissions');
    }

    let invitation = await createInvitation({ threadId, email, senderId: session.user.id });
    if (!invitation) {
      // Already invited — treat as success (idempotent) rather than CONFLICT
      invitation = await prisma.threadInvitation.findUnique({
        where: { threadId_email: { threadId, email } },
        include: {
          thread: { select: { slug: true, name: true } },
          sender: { select: { name: true, email: true } },
        },
      });
    }
    if (!invitation) {
      return actionFailure('CONFLICT', 'Invitation already exists');
    }

    // Invites are keyed by email, so the invitee may not have an account yet
    const user = await prisma.user.findUnique({
      where: { email, deletedAt: null },
      select: { id: true },
    });

    if (user) {
      await dispatch({
        recipients: { userIds: [user.id] },
        category: 'INVITATION',
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
      const exists = await findThreadById(threadId);
      if (!exists) return actionFailure('NOT_FOUND', 'Thread not found');
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
    await removeMemberInvitations(threadId, user.email);

    revalidatePath(`/dashboard/threads/${thread.slug}`);
    return actionSuccess(null);
  }
);

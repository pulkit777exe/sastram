'use server';

import { logger } from '@/lib/infrastructure/logger';

import { requireSession } from '@/modules/auth';
import { revalidatePath } from 'next/cache';
import { inviteFriendSchema } from './schemas';
import { actionSuccess, actionFailure } from '@/lib/actions/result';
import type { ActionEnvelope, ActionErrorCode } from '@/lib/actions/result';
import { AppError, isPrismaUniqueConstraintError } from '@/lib/utils/errors';
import {
  createInvitation,
  findInvitationById,
  findManageableThread,
  findThreadById,
  listThreadInvitations,
  revokeInvitation,
} from './repository';

function toEnvelope<T>(error: unknown): ActionEnvelope<T> {
  if (isPrismaUniqueConstraintError(error)) {
    return actionFailure<T>('CONFLICT', 'You have already invited this friend to this thread');
  }
  if (error instanceof AppError) {
    return actionFailure<T>((error.code as ActionErrorCode) ?? 'INTERNAL_ERROR', error.message);
  }
  return actionFailure<T>('INTERNAL_ERROR', 'Something went wrong');
}

export async function inviteFriendToThread(formData: FormData) {
  const parsed = inviteFriendSchema.safeParse({
    threadId: formData.get('threadId'),
    email: formData.get('email'),
    message: formData.get('message') ?? undefined,
  });

  if (!parsed.success) {
    return actionFailure('VALIDATION_ERROR', 'Invalid input');
  }

  try {
    const session = await requireSession();

    const thread = await findManageableThread(parsed.data.threadId, session.user.id, session.user.role);

    if (!thread) {
      const exists = await findThreadById(parsed.data.threadId);
      if (!exists) return actionFailure('NOT_FOUND', 'Thread not found');
      return actionFailure('FORBIDDEN', 'Only the thread creator or moderators can invite people');
    }

    const invitation = await createInvitation({
      threadId: parsed.data.threadId,
      email: parsed.data.email,
      senderId: session.user.id,
    });

    if (!invitation) {
      return actionFailure('CONFLICT', 'You have already invited this friend to this thread');
    }

    const { sendThreadInvitation } = await import('@/lib/services/email');

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invitations/accept?id=${invitation.id}`;
    await sendThreadInvitation(
      invitation.email,
      session.user.name || 'Someone',
      thread.name,
      `You've been invited to join the discussion on "${thread.name}".`,
      inviteUrl
    ).catch((err) => logger.error('[inviteFriendToThread] Failed to send email:', err));

    revalidatePath(`/dashboard/threads/${thread.slug}`);
    return actionSuccess(invitation);
  } catch (error) {
    logger.error('[inviteFriendToThread]', error);
    return toEnvelope(error);
  }
}

export interface ThreadInvitationView {
  id: string;
  email: string;
  status: string;
  createdAt: Date;
}

export async function listThreadInvitationsAction(
  threadId: string
): Promise<ActionEnvelope<ThreadInvitationView[]>> {
  try {
    const session = await requireSession();

    const thread = await findManageableThread(threadId, session.user.id, session.user.role);

    if (!thread) {
      const exists = await findThreadById(threadId);
      if (!exists) return actionFailure<ThreadInvitationView[]>('NOT_FOUND', 'Thread not found');
      return actionFailure<ThreadInvitationView[]>('FORBIDDEN', 'Insufficient permissions');
    }

    const invitations = await listThreadInvitations(threadId);

    return actionSuccess(
      invitations.map((i) => ({
        id: i.id,
        email: i.email,
        status: i.status,
        createdAt: i.createdAt,
      }))
    );
  } catch (error) {
    logger.error('[listThreadInvitationsAction]', error);
    return toEnvelope<ThreadInvitationView[]>(error);
  }
}

export async function revokeThreadInvitationAction(invitationId: string) {
  try {
    const session = await requireSession();

    const invitation = await findInvitationById(invitationId);

    if (!invitation) {
      return actionFailure('NOT_FOUND', 'Invitation not found');
    }

    const thread = await findManageableThread(invitation.threadId, session.user.id, session.user.role);

    if (!thread) {
      const exists = await findThreadById(invitation.threadId);
      if (!exists) return actionFailure('NOT_FOUND', 'Thread not found');
      return actionFailure('FORBIDDEN', 'Insufficient permissions');
    }

    await revokeInvitation(invitationId);

    revalidatePath(`/dashboard/threads/${thread.slug}`);
    return actionSuccess({ id: invitationId });
  } catch (error) {
    logger.error('[revokeThreadInvitationAction]', error);
    return toEnvelope(error);
  }
}

'use server';

import { logger } from '@/lib/infrastructure/logger';

import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth';
import { revalidatePath } from 'next/cache';
import { inviteFriendSchema } from './schemas';
import { canManageThread } from '@/lib/thread-access';
import { actionSuccess, actionFailure } from '@/lib/actions/result';
import type { ActionEnvelope, ActionErrorCode } from '@/lib/actions/result';
import { AppError } from '@/lib/utils/errors';

function toEnvelope<T>(error: unknown): ActionEnvelope<T> {
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

    const thread = await prisma.thread.findFirst({
      where: { id: parsed.data.threadId, deletedAt: null },
      select: { id: true, slug: true, name: true, createdBy: true, visibility: true },
    });

    if (!thread) {
      return actionFailure('NOT_FOUND', 'Thread not found');
    }

    if (
      !canManageThread(
        { threadId: thread.id, createdBy: thread.createdBy, visibility: thread.visibility },
        session.user.id,
        session.user.role
      )
    ) {
      return actionFailure(
        'FORBIDDEN',
        'Only the thread creator or moderators can invite people'
      );
    }

    // Clear any declined/expired invitations so the user can be re-invited
    await prisma.threadInvitation.deleteMany({
      where: {
        threadId: parsed.data.threadId,
        email: parsed.data.email,
        status: { in: ['DECLINED', 'EXPIRED'] },
      },
    });

    const existingInvitation = await prisma.threadInvitation.findUnique({
      where: {
        threadId_email: {
          threadId: parsed.data.threadId,
          email: parsed.data.email,
        },
      },
    });

    if (existingInvitation) {
      return actionFailure('CONFLICT', 'You have already invited this friend to this thread');
    }

    const invitation = await prisma.threadInvitation.create({
      data: {
        threadId: parsed.data.threadId,
        senderId: session.user.id,
        email: parsed.data.email,
        status: 'PENDING',
      },
      include: {
        thread: {
          select: {
            slug: true,
            name: true,
          },
        },
        sender: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

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

    const thread = await prisma.thread.findFirst({
      where: { id: threadId, deletedAt: null },
      select: { id: true, slug: true, name: true, createdBy: true, visibility: true },
    });

    if (!thread) {
      return actionFailure<ThreadInvitationView[]>('NOT_FOUND', 'Thread not found');
    }

    if (
      !canManageThread(
        { threadId: thread.id, createdBy: thread.createdBy, visibility: thread.visibility },
        session.user.id,
        session.user.role
      )
    ) {
      return actionFailure<ThreadInvitationView[]>('FORBIDDEN', 'Insufficient permissions');
    }

    const invitations = await prisma.threadInvitation.findMany({
      where: { threadId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, status: true, createdAt: true },
    });

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

    const invitation = await prisma.threadInvitation.findUnique({
      where: { id: invitationId },
      select: { id: true, threadId: true },
    });

    if (!invitation) {
      return actionFailure('NOT_FOUND', 'Invitation not found');
    }

    const thread = await prisma.thread.findFirst({
      where: { id: invitation.threadId, deletedAt: null },
      select: { id: true, slug: true, createdBy: true, visibility: true },
    });

    if (!thread) {
      return actionFailure('NOT_FOUND', 'Thread not found');
    }

    if (
      !canManageThread(
        { threadId: thread.id, createdBy: thread.createdBy, visibility: thread.visibility },
        session.user.id,
        session.user.role
      )
    ) {
      return actionFailure('FORBIDDEN', 'Insufficient permissions');
    }

    await prisma.threadInvitation.delete({ where: { id: invitationId } });

    revalidatePath(`/dashboard/threads/${thread.slug}`);
    return actionSuccess({ id: invitationId });
  } catch (error) {
    logger.error('[revokeThreadInvitationAction]', error);
    return toEnvelope(error);
  }
}

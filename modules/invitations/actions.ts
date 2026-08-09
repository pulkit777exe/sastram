'use server';

import { logger } from '@/lib/infrastructure/logger';

import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import { inviteFriendSchema } from './schemas';
import { canManageThread } from '@/lib/thread-access';
import { actionSuccess } from '@/lib/actions/result';
import { AppError } from '@/lib/utils/errors';
import type { ActionErrorCode } from '@/lib/actions/result';

export async function inviteFriendToThread(formData: FormData) {
  const threadId = formData.get('threadId') as string;
  const email = formData.get('email') as string;

  const parsed = inviteFriendSchema.safeParse({ threadId, email });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input', ok: false, errorCode: 'VALIDATION_ERROR' as ActionErrorCode };
  }

  try {
    const session = await requireSession();

    // Check if thread exists
    const thread = await prisma.thread.findFirst({
      where: { id: parsed.data.threadId, deletedAt: null },
      select: { id: true, slug: true, name: true, createdBy: true, visibility: true },
    });

    if (!thread) {
      return { data: null, error: 'Thread not found', ok: false, errorCode: 'NOT_FOUND' as ActionErrorCode };
    }

    if (!canManageThread({ threadId: thread.id, createdBy: thread.createdBy, visibility: thread.visibility }, session.user.id, session.user.role)) {
      return { data: null, error: 'Only the thread creator or moderators can invite people', ok: false, errorCode: 'FORBIDDEN' as ActionErrorCode };
    }

    // Clear any declined/expired invitations so the user can be re-invited
    await prisma.threadInvitation.deleteMany({
      where: {
        threadId: parsed.data.threadId,
        email: parsed.data.email,
        status: { in: ['DECLINED', 'EXPIRED'] },
      },
    });

    // Check if a pending invitation already exists
    const existingInvitation = await prisma.threadInvitation.findUnique({
      where: {
        threadId_email: {
          threadId: parsed.data.threadId,
          email: parsed.data.email,
        },
      },
    });

    if (existingInvitation) {
      return {
        data: null,
        error: 'You have already invited this friend to this thread',
        ok: false,
        errorCode: 'CONFLICT' as ActionErrorCode,
      };
    }

    // Create invitation
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
    if (error instanceof AppError) {
      return { data: null, error: error.message, ok: false, errorCode: error.code as ActionErrorCode };
    }
    return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
  }
};

export interface ThreadInvitationView {
  id: string;
  email: string;
  status: string;
  createdAt: Date;
}

export async function listThreadInvitationsAction(threadId: string) {
  try {
    const session = await requireSession();

    const thread = await prisma.thread.findFirst({
      where: { id: threadId, deletedAt: null },
      select: { id: true, slug: true, name: true, createdBy: true, visibility: true },
    });

    if (!thread) {
      return { data: null as ThreadInvitationView[] | null, error: 'Thread not found', ok: false, errorCode: 'NOT_FOUND' };
    }

    if (!canManageThread({ threadId: thread.id, createdBy: thread.createdBy, visibility: thread.visibility }, session.user.id, session.user.role)) {
      return { data: null as ThreadInvitationView[] | null, error: 'Insufficient permissions', ok: false, errorCode: 'FORBIDDEN' };
    }

    const invitations = await prisma.threadInvitation.findMany({
      where: { threadId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, status: true, createdAt: true },
    });

    return actionSuccess(invitations.map((i) => ({
      id: i.id,
      email: i.email,
      status: i.status,
      createdAt: i.createdAt,
    })));
  } catch (error) {
    logger.error('[listThreadInvitationsAction]', error);
    if (error instanceof AppError) {
      return { data: null as ThreadInvitationView[] | null, error: error.message, ok: false, errorCode: error.code as ActionErrorCode };
    }
    return { data: null as ThreadInvitationView[] | null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
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
      return { data: null, error: 'Invitation not found', ok: false, errorCode: 'NOT_FOUND' as ActionErrorCode };
    }

    const thread = await prisma.thread.findFirst({
      where: { id: invitation.threadId, deletedAt: null },
      select: { id: true, slug: true, createdBy: true, visibility: true },
    });

    if (!thread) {
      return { data: null, error: 'Thread not found', ok: false, errorCode: 'NOT_FOUND' as ActionErrorCode };
    }

    if (!canManageThread({ threadId: thread.id, createdBy: thread.createdBy, visibility: thread.visibility }, session.user.id, session.user.role)) {
      return { data: null, error: 'Insufficient permissions', ok: false, errorCode: 'FORBIDDEN' as ActionErrorCode };
    }

    await prisma.threadInvitation.delete({ where: { id: invitationId } });

    revalidatePath(`/dashboard/threads/${thread.slug}`);
    return actionSuccess({ id: invitationId });
  } catch (error) {
    logger.error('[revokeThreadInvitationAction]', error);
    if (error instanceof AppError) {
      return { data: null, error: error.message, ok: false, errorCode: error.code as ActionErrorCode };
    }
    return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
  }
};

'use server';

import { logger } from '@/lib/infrastructure/logger';

import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import { inviteFriendSchema } from './schemas';
import { canManageThread } from '@/lib/thread-access';

export async function inviteFriendToThread(formData: FormData) {
  const threadId = formData.get('threadId') as string;
  const email = formData.get('email') as string;

  const parsed = inviteFriendSchema.safeParse({ threadId, email });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();

    // Check if thread exists
    const thread = await prisma.thread.findFirst({
      where: { id: parsed.data.threadId, deletedAt: null },
      select: { id: true, slug: true, name: true, createdBy: true, visibility: true },
    });

    if (!thread) {
      return { data: null, error: 'Thread not found' };
    }

    if (!canManageThread({ threadId: thread.id, createdBy: thread.createdBy, visibility: thread.visibility }, session.user.id, session.user.role)) {
      return { data: null, error: 'Only the thread creator or moderators can invite people' };
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
    return { data: invitation, error: null };
  } catch (error) {
    logger.error('[inviteFriendToThread]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

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
      return { data: null as ThreadInvitationView[] | null, error: 'Thread not found' };
    }

    if (!canManageThread({ threadId: thread.id, createdBy: thread.createdBy, visibility: thread.visibility }, session.user.id, session.user.role)) {
      return { data: null as ThreadInvitationView[] | null, error: 'Insufficient permissions' };
    }

    const invitations = await prisma.threadInvitation.findMany({
      where: { threadId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, status: true, createdAt: true },
    });

    return {
      data: invitations.map((i) => ({
        id: i.id,
        email: i.email,
        status: i.status,
        createdAt: i.createdAt,
      })),
      error: null,
    };
  } catch (error) {
    logger.error('[listThreadInvitationsAction]', error);
    return { data: null as ThreadInvitationView[] | null, error: 'Something went wrong' };
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
      return { data: null, error: 'Invitation not found' };
    }

    const thread = await prisma.thread.findFirst({
      where: { id: invitation.threadId, deletedAt: null },
      select: { id: true, slug: true, createdBy: true, visibility: true },
    });

    if (!thread) {
      return { data: null, error: 'Thread not found' };
    }

    if (!canManageThread({ threadId: thread.id, createdBy: thread.createdBy, visibility: thread.visibility }, session.user.id, session.user.role)) {
      return { data: null, error: 'Insufficient permissions' };
    }

    await prisma.threadInvitation.delete({ where: { id: invitationId } });

    revalidatePath(`/dashboard/threads/${thread.slug}`);
    return { data: { id: invitationId }, error: null };
  } catch (error) {
    logger.error('[revokeThreadInvitationAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

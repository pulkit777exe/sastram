'use server';

import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import { inviteFriendSchema } from './schemas';
import { prismaErrorMessage } from '@/lib/utils/errors';
import { ROUTES } from '@/lib/config/routes';

export async function inviteFriendToThread(formData: FormData) {
  const threadId = formData.get('threadId') as string;
  const email = formData.get('email') as string;

  const parsed = inviteFriendSchema.safeParse({ threadId, email });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input', ok: false, errorCode: 'VALIDATION_ERROR' };
  }

  try {
    const session = await requireSession(false);

    const thread = await prisma.thread.findUnique({
      where: { id: parsed.data.threadId },
      select: { id: true, slug: true, name: true },
    });

    if (!thread) {
      return { data: null, error: 'Thread not found', ok: false, errorCode: 'NOT_FOUND' };
    }

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
        errorCode: 'CONFLICT',
      };
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

    const { sendEmail } = await import('@/lib/services/email');

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}${ROUTES.THREAD(thread.slug)}?invite=${invitation.id}`;
    await sendEmail({
      to: invitation.email,
      subject: `${session.user.name || 'Someone'} invited you to "${thread.name}"`,
      html: `
        <p>You've been invited to join the discussion on "${thread.name}".</p>
        <p><a href="${inviteUrl}">Click here to join</a></p>
      `,
    }).catch((err) => logger.error('[inviteFriendToThread] Failed to send email:', err));

    revalidatePath(ROUTES.THREAD(thread.slug));
    return { data: invitation, error: null, ok: true, errorCode: null };
  } catch (error) {
    const prismaMsg = prismaErrorMessage(error);
    if (prismaMsg) return { data: null, error: prismaMsg, ok: false, errorCode: 'INTERNAL_ERROR' };
    logger.error('[inviteFriendToThread]', error);
    return { data: null, error: 'Something went wrong', ok: false, errorCode: 'INTERNAL_ERROR' };
  }
}

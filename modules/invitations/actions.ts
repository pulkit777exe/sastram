'use server';

import { logger } from '@/lib/infrastructure/logger';

import { prisma } from '@/lib/infrastructure/prisma';
import { auth } from '@/lib/services/auth';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { inviteFriendSchema } from './schemas';

export async function inviteFriendToThread(formData: FormData) {
  const threadId = formData.get('threadId') as string;
  const email = formData.get('email') as string;

  const parsed = inviteFriendSchema.safeParse({ threadId, email });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { data: null, error: 'Something went wrong' };
    }

    // Check if thread exists
    const thread = await prisma.section.findUnique({
      where: { id: parsed.data.threadId },
      select: { id: true, slug: true, name: true },
    });

    if (!thread) {
      return { data: null, error: 'Thread not found' };
    }

    // Check if invitation already exists
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

    const { sendEmail } = await import('@/lib/services/email');

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/threads/${thread.slug}?invite=${invitation.id}`;
    await sendEmail({
      to: invitation.email,
      subject: `${session.user.name || 'Someone'} invited you to "${thread.name}"`,
      html: `
        <p>You've been invited to join the discussion on "${thread.name}".</p>
        <p><a href="${inviteUrl}">Click here to join</a></p>
      `,
    }).catch((err) => logger.error('[inviteFriendToThread] Failed to send email:', err));

    revalidatePath(`/dashboard/threads/${thread.slug}`);
    return { data: invitation, error: null };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return { data: null, error: 'You have already invited this friend to this thread' };
    }
    logger.error('[inviteFriendToThread]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

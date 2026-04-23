'use server';

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

    // TODO: Send email notification here

    revalidatePath(`/dashboard/threads/thread/${thread.slug}`);
    return { data: invitation, error: null };
  } catch (error) {
    console.error('[inviteFriendToThread]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

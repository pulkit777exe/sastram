import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '@/lib/utils/api-response';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSessionOrThrow } from '@/modules/auth/session';
import { logger } from '@/lib/infrastructure/logger';
import { revalidatePath } from 'next/cache';

export async function POST(request: NextRequest) {
  try {
    const session = await requireSessionOrThrow();

    const body = await request.json();
    const invitationId = body.invitationId as string;

    if (!invitationId) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Missing invitationId'), { status: 400 });
    }

    const invitation = await prisma.threadInvitation.findUnique({
      where: { id: invitationId },
      include: {
        thread: { select: { id: true, slug: true, name: true } },
      },
    });

    if (!invitation) {
      return NextResponse.json(fail('NOT_FOUND', 'Invitation not found'), { status: 404 });
    }

    const isExpired = invitation.expiresAt && invitation.expiresAt.getTime() <= Date.now();
    if (isExpired) {
      await prisma.threadInvitation.update({
        where: { id: invitationId },
        data: { status: 'EXPIRED' },
      });
      return NextResponse.json(fail('EXPIRED', 'This invitation has expired'), { status: 410 });
    }

    if (invitation.status === 'ACCEPTED') {
      return NextResponse.json(ok({ threadSlug: invitation.thread.slug, alreadyAccepted: true }));
    }

    if (invitation.status === 'DECLINED' || invitation.status === 'EXPIRED') {
      return NextResponse.json(fail(invitation.status, `This invitation has been ${invitation.status.toLowerCase()}`), { status: 410 });
    }

    if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
      return NextResponse.json(
        fail('EMAIL_MISMATCH', `This invitation was sent to ${invitation.email}, but you are signed in as ${session.user.email}`),
        { status: 403 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.threadInvitation.update({
        where: { id: invitationId },
        data: { status: 'ACCEPTED' },
      });
    });

    revalidatePath(`/dashboard/threads/${invitation.thread.slug}`);
    return NextResponse.json(ok({ threadSlug: invitation.thread.slug }));
  } catch (error) {
    logger.error('[invitations/accept]', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Something went wrong'), { status: 500 });
  }
}

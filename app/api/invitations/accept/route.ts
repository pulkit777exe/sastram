import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSessionOrThrow } from '@/modules/auth';
import { logger } from '@/lib/infrastructure/logger';
import { AppError } from '@/lib/utils/errors';
import { rateLimit } from '@/lib/services/rate-limit';
import { revalidatePath } from 'next/cache';

export async function POST(request: NextRequest) {
  try {
    const session = await requireSessionOrThrow();
    const rl = await rateLimit({ key: `invitations:${session.user.id}`, type: 'api' });
    if (!rl.success) return NextResponse.json(fail('RATE_LIMITED', 'Too many invitation attempts'), { status: HTTP_STATUS.RATE_LIMITED });

    const body = await request.json();
    const rawInvitationId = body.invitationId as string;

    if (!rawInvitationId || typeof rawInvitationId !== 'string') {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Missing invitationId'), { status: HTTP_STATUS.BAD_REQUEST });
    }
    // Validate cuid shape to avoid P2025 leak
    if (!/^c[a-z0-9]{24}$/.test(rawInvitationId)) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid invitationId'), { status: HTTP_STATUS.BAD_REQUEST });
    }
    const invitationId = rawInvitationId;

    const invitation = await prisma.threadInvitation.findUnique({
      where: { id: invitationId },
      include: {
        thread: { select: { id: true, slug: true, name: true, deletedAt: true } },
      },
    });

    if (invitation?.thread?.deletedAt) {
      return NextResponse.json(fail('NOT_FOUND', 'Invitation not found'), { status: HTTP_STATUS.NOT_FOUND });
    }

    if (!invitation) {
      return NextResponse.json(fail('NOT_FOUND', 'Invitation not found'), { status: HTTP_STATUS.NOT_FOUND });
    }

    const isExpired = invitation.expiresAt && invitation.expiresAt.getTime() <= Date.now();
    if (isExpired) {
      await prisma.threadInvitation.update({
        where: { id: invitationId },
        data: { status: 'EXPIRED' },
      });
      return NextResponse.json(fail('EXPIRED', 'This invitation has expired'), { status: 410 });
    }

    // Do not reveal the invited address (or the invitation status) to anyone
    // else holding a forwarded link.
    if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
      return NextResponse.json(
        fail('EMAIL_MISMATCH', 'This invitation was issued to a different email address'),
        { status: HTTP_STATUS.FORBIDDEN }
      );
    }

    if (invitation.status === 'ACCEPTED') {
      return NextResponse.json(ok({ threadSlug: invitation.thread.slug, alreadyAccepted: true }));
    }

    if (invitation.status === 'DECLINED' || invitation.status === 'EXPIRED') {
      return NextResponse.json(fail(invitation.status, `This invitation has been ${invitation.status.toLowerCase()}`), { status: 410 });
    }

    await prisma.threadInvitation.update({
      where: { id: invitationId },
      data: { status: 'ACCEPTED', inviteeId: session.user.id },
    });

    revalidatePath(`/dashboard/threads/${invitation.thread.slug}`);
    return NextResponse.json(ok({ threadSlug: invitation.thread.slug }));
  } catch (error) {
    if (AppError.isAppError(error) && error.code === 'AUTH_REQUIRED') {
      return NextResponse.json(fail('AUTH_REQUIRED', 'Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED });
    }
    logger.error('[invitations/accept]', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Something went wrong'), { status: HTTP_STATUS.INTERNAL });
  }
}

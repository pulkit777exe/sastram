import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { requireReadOrThrow } from '@/lib/thread-access';
import { claimBounties } from '@/modules/bounties/repository';
import { rateLimit } from '@/lib/services/rate-limit';

const claimSchema = z.object({ threadId: z.string().cuid() });

export const POST = withErrorHandling(async (request: NextRequest) => {
  const session = await requireSessionOrThrow();
  const { success } = await rateLimit({ key: `bounties:claim:${session.user.id}`, type: 'api' });
  if (!success) {
    return NextResponse.json(fail('RATE_LIMITED', 'Too many bounty claims, try later'), {
      status: HTTP_STATUS.RATE_LIMITED,
    });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid JSON body'), { status: HTTP_STATUS.BAD_REQUEST });
  }
  const parsed = claimSchema.safeParse(json);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request';
    return NextResponse.json(fail('VALIDATION_ERROR', message), { status: HTTP_STATUS.BAD_REQUEST });
  }
  const { threadId } = parsed.data;

  const thread = await requireReadOrThrow(threadId, session.user.id, session.user.role);

  // Bounties are points contributed by the community; only the thread creator
  // may settle them. Moderators deliberately do not get a payout override.
  if (thread.createdBy !== session.user.id) {
    return NextResponse.json(fail('FORBIDDEN', 'Only the thread creator can claim bounties'), {
      status: HTTP_STATUS.FORBIDDEN,
    });
  }

  const result = await claimBounties(threadId);
  return NextResponse.json(ok(result), { status: HTTP_STATUS.OK });
});

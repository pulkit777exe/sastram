import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { createExternalForkDomain, threadVisibilitySchema } from '@/modules/threads/threads-write/service';
import { infraThreadSideEffects } from '@/modules/threads/adapters/infra-side-effects';
import { sanitizeUserContent, isSafePublicUrl } from '@/lib/services/content-safety';
import { rateLimit } from '@/lib/services/rate-limit';

const bodySchema = z.object({
  url: z.string().url(),
  title: z.string().min(3).max(120).optional(),
  visibility: threadVisibilitySchema.optional().default('PUBLIC'),
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const session = await requireSessionOrThrow();
  const { success } = await rateLimit({ key: `fork-external:${session.user.id}`, type: 'api' });
  if (!success) return NextResponse.json(fail('RATE_LIMITED', 'Too many external forks, slow down'), { status: HTTP_STATUS.RATE_LIMITED });

  const body = bodySchema.parse(await request.json());
  if (!isSafePublicUrl(body.url)) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'URL must be a public http/https URL'), { status: HTTP_STATUS.BAD_REQUEST });
  }

  const url = body.url.trim();
  // Derive title from URL if not provided: use hostname + path
  let title = body.title?.trim();
  if (!title) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '');
      const path = u.pathname.slice(0, 40);
      title = `${host}${path ? ` ${path}` : ''}`.slice(0, 120);
    } catch {
      title = url.slice(0, 120);
    }
  }
  const safeTitle = sanitizeUserContent(title).sanitized.trim().slice(0, 120);

  const description = `Forked from ${url}`;
  const initialMessage = `Forked from ${url}\n\n@sai summarize this thread and extract key points from the source.`;

  // Single write: visibility (incl. RESTRICTED) is set inline at create time.
  const result = await createExternalForkDomain({
    title: safeTitle,
    description: sanitizeUserContent(description).sanitized,
    initialMessage: sanitizeUserContent(initialMessage).sanitized,
    visibility: body.visibility,
    userId: session.user.id,
    sideEffects: infraThreadSideEffects,
  });

  infraThreadSideEffects.revalidateDashboard();
  return NextResponse.json(ok({ id: result.id, slug: result.slug, title: safeTitle }), { status: HTTP_STATUS.OK });
});

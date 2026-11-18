import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { createExternalForkDomain, threadVisibilitySchema } from '@/modules/threads/mutations';
import { infraThreadSideEffects } from '@/modules/threads/infra-effects';
import { sanitizeUserContent, isSafePublicUrl } from '@/lib/services/content-safety';
import { rateLimit } from '@/lib/services/rate-limit';

const bodySchema = z.object({
  url: z.string().url(),
  title: z.string().min(3).max(120).optional(),
  visibility: threadVisibilitySchema.optional().default('PUBLIC'),
  excerpt: z.string().max(500).optional(),
  attribution: z.string().max(200).optional(),
  premise: z.string().max(500).optional(),
  parentThreadId: z.string().cuid().optional(),
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const session = await requireSessionOrThrow();
  const { success } = await rateLimit({ key: `fork-external:${session.user.id}`, type: 'api' });
  if (!success) return NextResponse.json(fail('RATE_LIMITED', 'Too many external forks, slow down'), { status: HTTP_STATUS.RATE_LIMITED });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid JSON body'), { status: HTTP_STATUS.BAD_REQUEST });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request';
    return NextResponse.json(fail('VALIDATION_ERROR', message), { status: HTTP_STATUS.BAD_REQUEST });
  }
  const body = parsed.data;
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

  const safeExcerpt = body.excerpt ? sanitizeUserContent(body.excerpt).sanitized.trim().slice(0, 500) : undefined;
  const safeAttribution = body.attribution ? sanitizeUserContent(body.attribution).sanitized.trim().slice(0, 200) : undefined;
  const safePremise = body.premise ? sanitizeUserContent(body.premise).sanitized.trim().slice(0, 500) : undefined;
  const initialMessage = `External source: ${url}\n\n@sai summarize this source using the provided excerpt/attribution and key points for discussion.`;

  // Single write: visibility (incl. RESTRICTED) is set inline at create time.
  const result = await createExternalForkDomain({
    title: safeTitle,
    description: undefined,
    initialMessage: sanitizeUserContent(initialMessage).sanitized,
    visibility: body.visibility,
    userId: session.user.id,
    sourceUrl: url,
    excerpt: safeExcerpt,
    attribution: safeAttribution,
    forkPremise: safePremise,
    parentThreadId: body.parentThreadId,
    sideEffects: infraThreadSideEffects,
  });

  infraThreadSideEffects.revalidateDashboard();
  return NextResponse.json(ok({ id: result.id, slug: result.slug, title: safeTitle }), { status: HTTP_STATUS.OK });
});

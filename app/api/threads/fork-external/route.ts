import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { prisma } from '@/lib/infrastructure/prisma';
import { buildThreadSlug } from '@/modules/threads/slug';
import { createThread } from '@/modules/threads/threads-write/repository';
import { sanitizeUserContent, isSafePublicUrl } from '@/lib/services/content-safety';
import { rateLimit } from '@/lib/services/rate-limit';
import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/lib/config/routes';

const bodySchema = z.object({
  url: z.string().url(),
  title: z.string().min(3).max(120).optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).optional().default('PUBLIC'),
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
  const slugBase = buildThreadSlug(safeTitle);
  let slug = slugBase;
  const existing = await prisma.thread.findUnique({ where: { slug }, select: { id: true } });
  if (existing) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  const description = `Forked from ${url}`;
  const initialMessage = `Forked from ${url}\n\n@sai summarize this thread and extract key points from the source.`;

  const result = await createThread({
    name: safeTitle,
    description: sanitizeUserContent(description).sanitized,
    slug,
    createdBy: session.user.id,
    initialMessage: sanitizeUserContent(initialMessage).sanitized,
  });

  // Visibility is handled at thread level; if PRIVATE, update after create
  if (body.visibility === 'PRIVATE' && result.thread.visibility !== 'PRIVATE') {
    await prisma.thread.update({ where: { id: result.thread.id }, data: { visibility: 'PRIVATE' } });
  }

  revalidatePath(ROUTES.DASHBOARD);
  return NextResponse.json(ok({ id: result.thread.id, slug: result.thread.slug, title: safeTitle }), { status: HTTP_STATUS.OK });
});

import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { isCollectionsEnabled } from '@/modules/collections/enabled';
import { rateLimit } from '@/lib/services/rate-limit';
import { prisma } from '@/lib/infrastructure/prisma';
import { Prisma } from '@prisma/client';

function parsePayloadFromSearchParams(searchParams: URLSearchParams) {
  const threadId = searchParams.get('threadId') || undefined;
  const sessionId = searchParams.get('sessionId') || undefined;
  const messageId = searchParams.get('messageId') || undefined;
  const metadataRaw = searchParams.get('metadata');
  let metadata: unknown = undefined;
  if (metadataRaw) {
    try {
      metadata = JSON.parse(metadataRaw);
    } catch {
      // ignore parse error — treat as no metadata
    }
  }
  return { threadId, sessionId, messageId, metadata };
}

async function getSavedCollectionIds(payload: { threadId?: string; sessionId?: string; messageId?: string; metadata?: unknown }, userId: string): Promise<string[]> {
  const { threadId, sessionId, messageId, metadata } = payload;
  if (!threadId && !sessionId && !messageId && !metadata) return [];
  const or: Prisma.CollectionItemWhereInput[] = [];
  if (threadId) or.push({ threadId });
  if (sessionId) or.push({ sessionId });
  if (messageId) or.push({ messageId });
  if (metadata !== undefined) or.push({ metadata: { equals: metadata as Prisma.InputJsonValue } });
  if (or.length === 0) return [];
  const items = await prisma.collectionItem.findMany({
    where: { collection: { userId }, OR: or },
    select: { collectionId: true },
  });
  return [...new Set(items.map((i) => i.collectionId))];
}

export const GET = withErrorHandling(async (request: NextRequest) => {
  const session = await requireSessionOrThrow();
  const rl = await rateLimit({ key: `collections:${session.user.id}`, type: 'api' });
  if (!rl.success) return NextResponse.json(fail('RATE_LIMITED', 'Too many requests'), { status: HTTP_STATUS.RATE_LIMITED });
  if (!(await isCollectionsEnabled(session.user.id))) {
    return NextResponse.json(fail('FEATURE_DISABLED', 'Collections is disabled'), { status: HTTP_STATUS.FORBIDDEN });
  }
  const payload = parsePayloadFromSearchParams(new URL(request.url).searchParams);
  if (!payload.threadId && !payload.sessionId && !payload.messageId && payload.metadata === undefined) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'threadId or sessionId or messageId or metadata required'), { status: HTTP_STATUS.BAD_REQUEST });
  }
  const ids = await getSavedCollectionIds(payload, session.user.id);
  return NextResponse.json(ok(ids));
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const session = await requireSessionOrThrow();
  const rl = await rateLimit({ key: `collections:${session.user.id}`, type: 'api' });
  if (!rl.success) return NextResponse.json(fail('RATE_LIMITED', 'Too many requests'), { status: HTTP_STATUS.RATE_LIMITED });
  if (!(await isCollectionsEnabled(session.user.id))) {
    return NextResponse.json(fail('FEATURE_DISABLED', 'Collections is disabled'), { status: HTTP_STATUS.FORBIDDEN });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid JSON body'), { status: HTTP_STATUS.BAD_REQUEST });
  }
  const payload = {
    threadId: typeof body.threadId === 'string' ? body.threadId : undefined,
    sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
    messageId: typeof body.messageId === 'string' ? body.messageId : undefined,
    metadata: body.metadata,
  };
  if (!payload.threadId && !payload.sessionId && !payload.messageId && payload.metadata === undefined) {
    return NextResponse.json(fail('VALIDATION_ERROR', 'threadId or sessionId or messageId or metadata required'), { status: HTTP_STATUS.BAD_REQUEST });
  }
  const ids = await getSavedCollectionIds(payload, session.user.id);
  return NextResponse.json(ok(ids));
});

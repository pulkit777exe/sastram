import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { prisma } from '@/lib/infrastructure/prisma';
import { MAX_COLLECTION_METADATA_BYTES } from '@/modules/collections/repository';
import { withCollectionsHandler } from '@/modules/collections/handler';
import { savePayloadSchema, type SavePayload } from '@/modules/collections/schemas';
import { metadataHash } from '@/modules/collections/metadata-hash';
import { Prisma } from '@prisma/client';

function parsePayloadFromSearchParams(searchParams: URLSearchParams) {
  const threadId = searchParams.get('threadId') || undefined;
  const sessionId = searchParams.get('sessionId') || undefined;
  const messageId = searchParams.get('messageId') || undefined;
  const metadataRaw = searchParams.get('metadata');
  let metadata: unknown = undefined;
  if (metadataRaw) {
    if (metadataRaw.length > MAX_COLLECTION_METADATA_BYTES) return { threadId, sessionId, messageId, metadata: undefined };
    try {
      metadata = JSON.parse(metadataRaw);
    } catch {
      // ignore parse error — treat as no metadata
    }
  }
  return { threadId, sessionId, messageId, metadata };
}

function invalidInput(message: string, details?: unknown) {
  return NextResponse.json(fail('VALIDATION_ERROR', message, details), { status: HTTP_STATUS.BAD_REQUEST });
}

async function getSavedCollectionIds(payload: SavePayload, userId: string): Promise<string[]> {
  const { threadId, sessionId, messageId, metadata } = payload;
  if (!threadId && !sessionId && !messageId && !metadata) return [];
  const or: Prisma.CollectionItemWhereInput[] = [];
  if (threadId) or.push({ threadId });
  if (sessionId) or.push({ sessionId });
  if (messageId) or.push({ messageId });
  if (metadata !== undefined) {
    // Hash-first (indexed unique), Json-equals fallback for pre-backfill rows.
    or.push({ metadataHash: metadataHash(metadata) });
    or.push({ metadata: { equals: metadata as Prisma.InputJsonValue } });
  }
  if (or.length === 0) return [];
  const items = await prisma.collectionItem.findMany({
    where: { collection: { userId }, OR: or },
    select: { collectionId: true },
  });
  return [...new Set(items.map((i) => i.collectionId))];
}

export const GET = withCollectionsHandler(async (request: NextRequest, session) => {
  const parsed = savePayloadSchema.safeParse(parsePayloadFromSearchParams(new URL(request.url).searchParams));
  if (!parsed.success) {
    return invalidInput(parsed.error.issues[0]?.message ?? 'Invalid input', parsed.error.issues);
  }
  const ids = await getSavedCollectionIds(parsed.data, session.user.id);
  return NextResponse.json(ok(ids));
});

export const POST = withCollectionsHandler(async (request: NextRequest, session) => {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid JSON body'), { status: HTTP_STATUS.BAD_REQUEST });
  }
  const parsed = savePayloadSchema.safeParse({
    threadId: typeof body.threadId === 'string' ? body.threadId : undefined,
    sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
    messageId: typeof body.messageId === 'string' ? body.messageId : undefined,
    metadata: body.metadata,
  });
  if (!parsed.success) {
    return invalidInput(parsed.error.issues[0]?.message ?? 'Invalid input', parsed.error.issues);
  }
  const ids = await getSavedCollectionIds(parsed.data, session.user.id);
  return NextResponse.json(ok(ids));
});

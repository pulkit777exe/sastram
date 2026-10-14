import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ok, HTTP_STATUS } from '@/lib/utils/api-response';
import { AppError } from '@/lib/utils/errors';
import { addManyToCollection } from '@/modules/collections/repository';
import { prismaCollectionPolicy } from '@/modules/collections/policy';
import { withCollectionsHandler, parseRouteId, parseWith } from '@/modules/collections/handler';
import { savePayloadSchema, collectionIdSchema } from '@/modules/collections/schemas';

const MAX_BULK_ITEMS = 50;

const bulkBodySchema = z.object({
  items: z.array(savePayloadSchema).min(1).max(MAX_BULK_ITEMS),
});

/**
 * Bulk save (ADR-0001: all-or-nothing). One ownership check, per-item
 * reference checks, then a single `$transaction`. Returns
 * `{ saved, skipped, failed: [] }` — duplicates skip, any other failure
 * throws and rolls back the whole batch.
 */
export const POST = withCollectionsHandler(async (request: NextRequest, session, context) => {
  const id = await parseRouteId(context, collectionIdSchema);
  const raw: unknown = await request.json().catch(() => {
    throw new AppError('Invalid JSON body', 'VALIDATION_ERROR', HTTP_STATUS.BAD_REQUEST);
  });
  if (Array.isArray((raw as { items?: unknown }).items) && (raw as { items: unknown[] }).items.length > MAX_BULK_ITEMS) {
    throw new AppError(
      `Maximum ${MAX_BULK_ITEMS} items per bulk request`,
      'VALIDATION_ERROR',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  const body = parseWith(bulkBodySchema, raw);

  await prismaCollectionPolicy.assertCollectionOwner(id, session.user.id);
  for (const item of body.items) {
    await prismaCollectionPolicy.assertCanAddRef(item, session.user.id, session.user.role);
  }
  const result = await addManyToCollection(id, body.items);
  return NextResponse.json(ok(result), { status: 201 });
});

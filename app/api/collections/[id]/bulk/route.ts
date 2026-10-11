import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ok, fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { addManyToCollection } from '@/modules/collections/repository';
import { prismaCollectionPolicy } from '@/modules/collections/policy';
import { withCollectionsHandler } from '@/modules/collections/handler';
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
  const { id } = await context!.params;
  const parsedId = collectionIdSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid collection id'), { status: HTTP_STATUS.BAD_REQUEST });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid JSON body'), { status: HTTP_STATUS.BAD_REQUEST });
  }
  if (Array.isArray((raw as { items?: unknown }).items) && (raw as { items: unknown[] }).items.length > MAX_BULK_ITEMS) {
    return NextResponse.json(fail('VALIDATION_ERROR', `Maximum ${MAX_BULK_ITEMS} items per bulk request`), {
      status: HTTP_STATUS.BAD_REQUEST,
    });
  }
  const parsed = bulkBodySchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid input';
    return NextResponse.json(fail('VALIDATION_ERROR', msg, parsed.error.issues), { status: HTTP_STATUS.BAD_REQUEST });
  }

  await prismaCollectionPolicy.assertCollectionOwner(parsedId.data, session.user.id);
  for (const item of parsed.data.items) {
    await prismaCollectionPolicy.assertCanAddRef(item, session.user.id, session.user.role);
  }
  const result = await addManyToCollection(parsedId.data, parsed.data.items);
  return NextResponse.json(ok(result), { status: 201 });
});

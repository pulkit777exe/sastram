import { z } from 'zod';
import { MAX_COLLECTION_METADATA_BYTES } from './repository';

const cuid = z.string().cuid();

/**
 * Single SavePayload value object for every collections write path.
 * Mirrors the historical `addSchema` in `app/api/collections/[id]/items/route.ts`
 * exactly (truthy-metadata refine, byte-cap refine) — no behavior change.
 */
export const savePayloadSchema = z
  .object({
    threadId: cuid.optional(),
    sessionId: cuid.optional(),
    messageId: cuid.optional(),
    metadata: z.unknown().optional(),
  })
  .refine(
    (d) => d.threadId || d.sessionId || d.messageId || d.metadata,
    'threadId or sessionId or messageId or metadata required',
  )
  .refine(
    (d) => {
      if (d.metadata === undefined) return true;
      try {
        return JSON.stringify(d.metadata).length <= MAX_COLLECTION_METADATA_BYTES;
      } catch {
        return false;
      }
    },
    'Metadata too large',
  );

export type SavePayload = z.infer<typeof savePayloadSchema>;

export const collectionIdSchema = cuid;

export const itemIdSchema = cuid;

/** Mirrors the historical `createSchema` in `app/api/collections/route.ts` exactly. */
export const createCollectionSchema = z.object({ title: z.string().min(1).max(100).trim() });

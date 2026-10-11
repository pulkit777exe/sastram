/**
 * Backfill `CollectionItem.metadataHash` for rows written before the
 * `20261011000000_add_collection_metadata_hash` migration.
 *
 * Idempotent: only touches rows with a NULL hash and non-null metadata;
 * re-running after a full backfill is a no-op. On a hash conflict the newer
 * duplicate row is deleted (keep-oldest, matching the migration dedupe).
 *
 * Run (DB must be migrated first):
 *   bun scripts/backfill-metadata-hash.ts
 */
import { prisma } from '@/lib/infrastructure/prisma';
import { metadataHash } from '@/modules/collections/metadata-hash';

const BATCH_SIZE = 500;

async function main() {
  let hashed = 0;
  let removed = 0;
  let scannedBatches = 0;

  for (;;) {
    const rows = await prisma.collectionItem.findMany({
      where: { metadataHash: null },
      select: { id: true, collectionId: true, createdAt: true, metadata: true },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });
    if (rows.length === 0) break;
    scannedBatches += 1;

    const actionable = rows.filter((row) => row.metadata !== null && row.metadata !== undefined);
    if (actionable.length === 0) break; // remaining NULL-hash rows carry no metadata; nothing to hash

    for (const row of actionable) {
      const hash = metadataHash(row.metadata);
      try {
        await prisma.collectionItem.update({ where: { id: row.id }, data: { metadataHash: hash } });
        hashed += 1;
      } catch (error) {
        const err = error as { code?: string };
        if (err?.code === 'P2002') {
          // A same-hash row (older or hashed by an earlier run) already owns
          // this key — drop the newer duplicate.
          await prisma.collectionItem.delete({ where: { id: row.id } });
          removed += 1;
          console.log(`[backfill] removed newer duplicate item ${row.id} in collection ${row.collectionId}`);
        } else {
          throw error;
        }
      }
    }

    if (rows.length < BATCH_SIZE) break;
  }

  console.log(`[backfill] done: hashed=${hashed} removedDuplicates=${removed} batches=${scannedBatches}`);
}

main()
  .catch((error) => {
    console.error('[backfill] failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

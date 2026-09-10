import { logger } from '@/lib/infrastructure/logger';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/infrastructure/prisma';
import { del } from '@vercel/blob';
import { verifyCronAuth } from '@/lib/middleware/cron-auth';
import { ok, fail } from '@/lib/utils/api-response';

const BATCH_SIZE = 50;

export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) {
    return authError;
  }

  try {
    let totalDeleted = 0;
    let totalBlobsRemoved = 0;
    let batchCount = 0;
    const MAX_BATCHES = 20; // safety cap: 20*50=1000 per cron invocation

    // Paginate until empty to avoid leaving orphans when >50 exist
    while (batchCount < MAX_BATCHES) {
      const orphanedAttachments = await prisma.attachment.findMany({
        where: {
          message: { deletedAt: { not: null } },
        },
        select: { id: true, url: true, messageId: true },
        take: BATCH_SIZE,
      });

      if (orphanedAttachments.length === 0) break;

      // Delete blobs (best-effort)
      const blobResults = await Promise.allSettled(orphanedAttachments.map((att) => del(att.url)));
      totalBlobsRemoved += blobResults.filter((r) => r.status === 'fulfilled').length;

      // Delete orphaned attachment records
      const ids = orphanedAttachments.map((a) => a.id);
      const deleteResult = await prisma.attachment.deleteMany({
        where: { id: { in: ids } },
      });
      totalDeleted += deleteResult.count;
      batchCount += 1;

      if (orphanedAttachments.length < BATCH_SIZE) break;
    }

    if (totalDeleted === 0) {
      return NextResponse.json(ok({ deleted: 0, blobsRemoved: 0, message: 'No orphaned attachments found' }));
    }

    logger.info('[cleanup-blobs]', {
      batches: batchCount,
      blobsRemoved: totalBlobsRemoved,
      recordsDeleted: totalDeleted,
    });

    return NextResponse.json(ok({ deleted: totalDeleted, blobsRemoved: totalBlobsRemoved }));
  } catch (error) {
    logger.error('[cleanup-blobs]', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to cleanup blobs'));
  }
}

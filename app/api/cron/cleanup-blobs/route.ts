import { logger } from '@/lib/infrastructure/logger';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/infrastructure/prisma';
import { del } from '@vercel/blob';
import { verifyCronAuth } from '@/lib/middleware/cron-auth';
import { ok, fail, HTTP_STATUS } from '@/lib/utils/api-response';

const BATCH_SIZE = 50;

export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) {
    return authError;
  }

  try {
    let totalDeleted = 0;
    let totalBlobsRemoved = 0;
    let totalBlobFailures = 0;
    let batchCount = 0;
    const MAX_BATCHES = 20; // safety cap: 20*50=1000 per cron invocation

    // Paginate until empty to avoid leaving orphans when >50 exist
    while (batchCount < MAX_BATCHES) {
      const orphanedAttachments = await prisma.attachment.findMany({
        where: {
          OR: [
            // Hard-purged thread/message: the FK was set null, so this row is
            // the only pointer to the blob.
            { messageId: null },
            { message: { deletedAt: { not: null } } },
          ],
        },
        select: { id: true, url: true },
        take: BATCH_SIZE,
      });

      if (orphanedAttachments.length === 0) break;

      // Delete blobs first. Only rows whose blob is actually gone are removed —
      // deleting a row after a failed del() would orphan the blob forever.
      const blobResults = await Promise.allSettled(orphanedAttachments.map((att) => del(att.url)));
      const removedIds: string[] = [];
      let failedBlobs = 0;
      blobResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          removedIds.push(orphanedAttachments[index].id);
        } else {
          failedBlobs += 1;
        }
      });
      totalBlobsRemoved += removedIds.length;
      totalBlobFailures += failedBlobs;
      batchCount += 1;

      if (removedIds.length > 0) {
        const deleteResult = await prisma.attachment.deleteMany({
          where: { id: { in: removedIds } },
        });
        totalDeleted += deleteResult.count;
      }

      if (failedBlobs > 0) {
        logger.warn('[cleanup-blobs] blob deletion failed; keeping records for the next run', {
          batch: batchCount,
          failed: failedBlobs,
        });
        // Stop paginating: the failed rows are re-selected first, so retrying
        // them within this invocation only burns time — the next run retries.
        break;
      }

      if (orphanedAttachments.length < BATCH_SIZE) break;
    }

    if (totalBlobFailures > 0) {
      logger.error('[cleanup-blobs] blob removals failed; attachment records kept for retry', {
        batches: batchCount,
        blobsRemoved: totalBlobsRemoved,
        recordsDeleted: totalDeleted,
        blobsFailed: totalBlobFailures,
      });
      return NextResponse.json(
        fail('INTERNAL_ERROR', 'Failed to remove one or more orphaned blobs; records kept for retry'),
        { status: HTTP_STATUS.INTERNAL }
      );
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
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to cleanup blobs'), { status: HTTP_STATUS.INTERNAL });
  }
}

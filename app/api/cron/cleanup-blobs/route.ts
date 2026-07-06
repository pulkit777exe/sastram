import { logger } from '@/lib/infrastructure/logger';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/infrastructure/prisma';
import { del } from '@vercel/blob';
import { verifyCronAuth } from '@/lib/utils/cron-auth';
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

    // Find attachments whose parent message is soft-deleted
    const orphanedAttachments = await prisma.attachment.findMany({
      where: {
        message: { deletedAt: { not: null } },
      },
      select: { id: true, url: true, messageId: true },
      take: BATCH_SIZE,
    });

    if (orphanedAttachments.length === 0) {
      return ok({ deleted: 0, blobsRemoved: 0, message: 'No orphaned attachments found' });
    }

    // Delete blobs (best-effort)
    const blobResults = await Promise.allSettled(
      orphanedAttachments.map((att) => del(att.url))
    );
    totalBlobsRemoved = blobResults.filter((r) => r.status === 'fulfilled').length;

    // Delete orphaned attachment records
    const ids = orphanedAttachments.map((a) => a.id);
    const deleteResult = await prisma.attachment.deleteMany({
      where: { id: { in: ids } },
    });
    totalDeleted = deleteResult.count;

    logger.info('[cleanup-blobs]', {
      orphanedFound: orphanedAttachments.length,
      blobsRemoved: totalBlobsRemoved,
      recordsDeleted: totalDeleted,
    });

    return ok({ deleted: totalDeleted, blobsRemoved: totalBlobsRemoved });
  } catch (error) {
    logger.error('[cleanup-blobs]', error);
    return fail('INTERNAL_ERROR', 'Failed to cleanup blobs');
  }
}

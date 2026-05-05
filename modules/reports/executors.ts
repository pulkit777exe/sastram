import { revalidatePath } from 'next/cache';
import { logAction } from '@/modules/audit/repository';
import { Prisma } from '@prisma/client';

export async function executeReportAuditAndRefresh(args: {
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  details?: Prisma.InputJsonValue | null;
  paths?: string[];
}) {
  await logAction({
    action: args.action,
    entityType: args.entityType,
    entityId: args.entityId,
    userId: args.userId,
    details: args.details,
  });

  for (const path of args.paths ?? ['/dashboard/admin/reports', '/dashboard/admin/moderation']) {
    revalidatePath(path);
  }
}

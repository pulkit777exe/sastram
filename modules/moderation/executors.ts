import { revalidatePath } from 'next/cache';
import { logAction } from '@/modules/audit';
import type { Prisma } from '@prisma/client';
import { ROUTES } from '@/lib/config/routes';

// Shared by the moderation and reports modules: every moderator action needs an
// audit trail plus a cache bust of whatever surfaces it appears on.
export async function executeAuditAndRevalidate(args: {
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

  for (const path of args.paths ?? [ROUTES.ADMIN_MODERATION, ROUTES.ADMIN_REPORTS]) {
    revalidatePath(path);
  }
}

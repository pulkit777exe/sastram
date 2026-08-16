import { cache } from 'react';
import { prisma } from '@/lib/infrastructure/prisma';
import { canAccessThread, canManageThread } from '@/modules/threads/access';

// There is no membership table — "role" is derived from thread visibility,
// authorship, and the viewer's global role.
export const getMemberRole = cache(async (threadId: string, userId: string) => {
  const [thread, user] = await Promise.all([
    prisma.thread.findFirst({
      where: { id: threadId, deletedAt: null },
      select: { id: true, createdBy: true, visibility: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    }),
  ]);

  if (!thread || !user) return null;

  const context = { threadId: thread.id, createdBy: thread.createdBy, visibility: thread.visibility };

  if (canManageThread(context, userId, user.role)) {
    return {
      role: thread.createdBy === userId ? 'OWNER' : 'MODERATOR',
      status: 'ACTIVE',
    } as const;
  }

  const allowed = await canAccessThread(context, userId, user.role);

  return allowed ? ({ role: 'MEMBER', status: 'ACTIVE' } as const) : null;
});

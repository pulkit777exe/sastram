'use server';

import { prisma } from '@/lib/infrastructure/prisma';
import { buildBannedUsersWhereClause } from './policy';
import { requireModerationRole } from '@/modules/policy';
import { getBannedUsersSchema } from './schemas';
import { createServerAction } from '@/lib/utils/server-action';
import { actionSuccess } from '@/lib/utils/server-action';
import { computeHasMore } from '@/lib/db/pagination';

// ── Shared select constants ────────────────────────────────────────────────
const BANNED_USER_SELECT = { id: true, name: true, email: true, image: true, status: true } as const;
const BAN_ISSUER_SELECT = { id: true, name: true, email: true } as const;
const BAN_THREAD_SELECT = { id: true, name: true, slug: true } as const;

const BANNED_USERS_INCLUDE = {
  user: { select: BANNED_USER_SELECT },
  issuer: { select: BAN_ISSUER_SELECT },
  thread: { select: BAN_THREAD_SELECT },
} as const;

export const getBannedUsers = createServerAction(
  { schema: getBannedUsersSchema, actionName: 'getBannedUsers' },
  async (filters) => {
    await requireModerationRole();

    const limit = Math.min(filters.limit || 50, 100);
    const offset = filters.offset || 0;

    const whereClause = buildBannedUsersWhereClause(filters);

    const [bans, totalCount] = await Promise.all([
      prisma.userBan.findMany({
        where: whereClause,
        include: BANNED_USERS_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.userBan.count({ where: whereClause }),
    ]);

    return actionSuccess({
      bans,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: computeHasMore(offset, limit, totalCount),
      },
    });
  }
);

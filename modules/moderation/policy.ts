export function buildBannedUsersWhereClause(filters: { isActive?: boolean; threadId?: string }): import('@prisma/client').Prisma.UserBanWhereInput {
  const whereClause: import('@prisma/client').Prisma.UserBanWhereInput = {};
  if (filters.isActive !== undefined) {
    whereClause.isActive = filters.isActive;
  }
  if (filters.threadId) {
    whereClause.threadId = filters.threadId;
  }
  return whereClause;
}

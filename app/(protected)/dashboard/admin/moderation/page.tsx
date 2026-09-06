import { assertAdmin } from '@/modules/auth';
import { getSession } from '@/modules/auth';
import { getReports, getReportStats } from '@/modules/reports';
import { getBannedUsers } from '@/modules/moderation';
import { getUserActivities } from '@/modules/audit';
import { ModerationDashboard } from '@/components/admin/moderation-dashboard';
import { BannedUsersList } from '@/components/admin/banned-users-list';

export default async function ModerationPage() {
  const session = await getSession();
  if (!session) return null;
  assertAdmin(session.user);

  const [reportsResult, statsResult, bannedUsersResult, userActivities] = await Promise.all([
    getReports({ status: 'PENDING', limit: 20 }),
    getReportStats(),
    getBannedUsers({ isActive: true, limit: 50 }),
    getUserActivities({ limit: 10 }),
  ]);

  const reports = reportsResult.data ?? [];
  const stats = statsResult.data ?? null;

  const ENTITY_ID_SUFFIX_LENGTH = 8;

  function getActivityDisplayName(user: { name?: string | null; email?: string | null } | null | undefined): string {
    if (user?.name) return user.name;
    if (user?.email) return user.email;
    return 'System';
  }

  function toAuditEntry(log: (typeof userActivities)[number]) {
    return {
      id: log.id,
      timestamp: log.createdAt,
      action: log.type,
      target: log.entityId.slice(-ENTITY_ID_SUFFIX_LENGTH),
      category: log.entityType,
      performedBy: getActivityDisplayName(log.user),
    };
  }

  function getBanStatus(ban: { user?: { status?: string | null } | null }): 'BANNED' | 'SUSPENDED' {
    if (ban.user?.status === 'BANNED') return 'BANNED';
    return 'SUSPENDED';
  }

  function getBannedBy(ban: { issuer?: { name: string | null } | null }) {
    if (ban.issuer) return { name: ban.issuer.name };
    return { name: null };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function normalizeBan(ban: any): any {
    return {
      ...ban,
      status: getBanStatus(ban),
      bannedBy: getBannedBy(ban),
    };
  }

  const userActivityEntries = userActivities.map(toAuditEntry);

  return (
    <div className="space-y-8">
      <ModerationDashboard
        stats={stats}
        reports={reports}
        auditLog={userActivityEntries}
        moderator={{
          name: session.user.name || 'Moderator',
          email: session.user.email,
          image: session.user.image || undefined,
        }}
      />

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Banned & Suspended Users</h2>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage users who have been banned from threads or the platform.
          </p>
        </div>
        {bannedUsersResult?.data && (
          <BannedUsersList bans={bannedUsersResult.data.bans.map(normalizeBan)} />
        )}
      </section>
    </div>
  );
}

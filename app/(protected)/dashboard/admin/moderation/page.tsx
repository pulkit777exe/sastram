import { assertAdmin } from "@/modules/auth/session";
import { useSession } from "@/lib/session-context";
import { getReports, getReportStats } from "@/modules/reports/actions";
import { getBannedUsers } from "@/modules/moderation/actions";
import { getUserActivities } from "@/modules/audit/repository";
import { ModerationDashboard } from "@/components/admin/moderation-dashboard";
import { BannedUsersList } from "@/components/admin/banned-users-list";

export default async function ModerationPage() {
  const session = useSession();
  if (!session) return null;
  assertAdmin(session.user);

  const [
    reportsResult,
    statsResult,
    bannedUsersResult,
    userActivities,
  ] = await Promise.all([
    getReports({ status: "PENDING", limit: 20 }),
    getReportStats(),
    getBannedUsers({ isActive: true, limit: 50 }),
    getUserActivities({ limit: 10 }),
  ]);

  const reports = reportsResult.data ?? [];
  const stats = statsResult.data ?? null;

   const userActivityEntries = userActivities.map((log) => ({
     id: log.id,
     timestamp: log.createdAt,
     action: log.type,
     target: log.entityId.slice(-8),
     category: log.entityType,
     performedBy: log.user?.name || log.user?.email || "System",
   }));

  return (
    <div className="space-y-8">
      <ModerationDashboard
        stats={stats}
        reports={reports}
        auditLog={userActivityEntries}
        moderator={{
          name: session.user.name || "Moderator",
          email: session.user.email,
          image: session.user.image || undefined,
        }}
      />

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            Banned & Suspended Users
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage users who have been banned from threads or the
            platform.
          </p>
        </div>
        {bannedUsersResult?.data && (
            <BannedUsersList
              bans={bannedUsersResult.data.bans.map((ban) => ({
                ...ban,
                status: ban.user.status === "BANNED" ? "BANNED" : "SUSPENDED",
                bannedBy: { name: ban.issuer.name },
              }))}
            />
          )}
      </section>
    </div>
  );
}

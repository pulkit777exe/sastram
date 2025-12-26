import { requireSession, assertAdmin } from "@/modules/auth/session";
import { getBannedUsers } from "@/modules/moderation/actions";
import { listThreads } from "@/modules/threads/repository";
import { listCommunities } from "@/modules/communities/repository";
import { BannedUsersList } from "@/components/admin/banned-users-list";
import { AdminModerationPanel } from "@/components/admin/admin-moderation-panel";

export default async function ModerationPage() {
  const session = await requireSession();
  assertAdmin(session.user);

  const [bannedUsersResult, threads, communities] = await Promise.all([
    getBannedUsers({ isActive: true, limit: 50 }),
    listThreads(),
    listCommunities(),
  ]);

  return (
    <div className="space-y-8">
      <header className="rounded-2xl border border-zinc-800 bg-[#1C1C1E] p-8">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">Admin Workspace</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Moderation Center</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Manage users, threads, and communities. Ban users, delete content, and maintain platform safety.
          </p>
        </div>
      </header>

      <AdminModerationPanel threads={threads} communities={communities} />

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Banned & Suspicious Users</h2>
          <p className="text-sm text-zinc-400 mt-1">
            View and manage users who have been banned from threads or the platform.
          </p>
        </div>
        {bannedUsersResult && "success" in bannedUsersResult && bannedUsersResult.success && (
          <BannedUsersList bans={bannedUsersResult.bans} />
        )}
      </section>
    </div>
  );
}


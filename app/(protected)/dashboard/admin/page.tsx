import { assertAdmin } from '@/modules/auth';
import { getSession } from '@/modules/auth';
import { listCommunities } from '@/modules/communities';
import { listThreads } from '@/modules/threads';
import { AdminDashboardForms } from '@/components/admin/admin-dashboard-forms';

export default async function AdminDashboardPage() {
  const session = await getSession();
  if (!session) return null;
  assertAdmin(session.user);

  const communitiesPromise = listCommunities();
  const threadsPromise = listThreads();

  return (
    <AdminDashboardForms
      communitiesPromise={communitiesPromise}
      threadsPromise={threadsPromise}
    />
  );
}

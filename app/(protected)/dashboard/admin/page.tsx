import { assertAdmin } from '@/modules/auth';
import { getSession } from '@/modules/auth';
import { listThreads } from '@/modules/threads';
import { AdminDashboardForms } from '@/components/admin/admin-dashboard-forms';

export default async function AdminDashboardPage() {
  const session = await getSession();
  if (!session) return null;
  assertAdmin(session.user);

  // Pass the admin user as viewer so listThreads applies the correct
  // visibility filter (admins see all threads via canModerate in the filter).
  const threadsPromise = listThreads({ memberUserId: session.user.id, memberRole: session.user.role });

  return (
    <AdminDashboardForms
      threadsPromise={threadsPromise}
    />
  );
}

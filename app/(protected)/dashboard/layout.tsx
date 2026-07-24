import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSession } from '@/modules/auth/session';
import { DashboardProviders } from '@/components/dashboard/dashboard-providers';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect('/login?reason=session_expired');
  }

  return (
    <DashboardProviders>
      <DashboardShell
        name={session.user.name || session.user.email || 'User'}
        email={session.user.email || 'User'}
        role={session.user.role}
      >
        {children}
      </DashboardShell>
    </DashboardProviders>
  );
}

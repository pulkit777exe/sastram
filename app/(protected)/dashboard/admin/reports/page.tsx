import { assertAdmin } from '@/modules/auth/session';
import { getSession } from '@/modules/auth/session';
import { getReports } from '@/modules/reports/actions';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Flag, CheckCircle, Eye } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import Link from 'next/link';
import TimeAgo from '@/components/ui/TimeAgo';
import { ReportActions } from '@/components/admin/report-actions';
import { Report } from '@/modules/reports';
import { ROUTES } from '@/lib/config/routes';
import { ReportListClient } from '@/components/admin/report-list-client';

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) return null;
  assertAdmin(session.user);

  const reportsResult = await getReports();
  const reports = reportsResult.data ?? [];

  return (
    <div className="space-y-8">
      <header className="rounded-3xl border border-border bg-muted-foreground/10 p-8 text-foreground shadow-xl">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Admin Workspace</p>
        <h1 className="mt-3 text-3xl font-semibold">Reports Management</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Review and manage user reports to keep the community safe and respectful.
        </p>
      </header>

      <ReportListClient initialReports={reports} />
    </div>
  );
}

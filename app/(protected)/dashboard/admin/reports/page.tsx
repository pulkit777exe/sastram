import { assertAdmin } from '@/modules/auth/session';
import { getSession } from '@/modules/auth/session';
import { getReports } from '@/modules/reports/actions';
import { Badge } from '@/components/ui/badge';
import { Flag, CheckCircle, Eye, Shield } from 'lucide-react';
import Link from 'next/link';
import TimeAgo from '@/components/ui/TimeAgo';
import { ReportActions } from '@/components/admin/report-actions';
import { Report } from '@/modules/reports';
import { cn } from '@/lib/utils/cn';

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) return null;
  assertAdmin(session.user);

  const reportsResult = await getReports();
  const reports = reportsResult.data ?? [];

  const pendingReports = reports.filter((r) => r.status === 'PENDING');
  const resolvedReports = reports.filter(
    (r) => r.status === 'RESOLVED' || r.status === 'DISMISSED'
  );

  return (
    <div className="dashboard-page space-y-8 animate-in fade-in duration-500">
      <div className="page-heading">
        <p className="page-eyebrow"><Shield className="h-3.5 w-3.5" /> Admin</p>
        <h1>Reports Management</h1>
        <p>Review and manage user reports to keep the community safe and respectful.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Reports</p>
              <p className="text-2xl font-bold text-foreground mt-1">{reports.length}</p>
            </div>
            <Flag className="h-8 w-8 text-muted-foreground" />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold text-yellow-500 mt-1">{pendingReports.length}</p>
            </div>
            <Eye className="h-8 w-8 text-yellow-500/50" />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Resolved</p>
              <p className="text-2xl font-bold text-green-500 mt-1">{resolvedReports.length}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500/50" />
          </div>
        </div>
      </div>

      <section className="space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-4">Pending Reports</h2>
          {pendingReports.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <CheckCircle size={16} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">No pending reports</p>
              <p className="text-xs text-muted-foreground">All reports have been reviewed.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingReports.map((report) => (
                <ReportCard key={report.id} report={report} />
              ))}
            </div>
          )}
        </div>

        {resolvedReports.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-4">Resolved Reports</h2>
            <div className="space-y-3">
              {resolvedReports.map((report) => (
                <ReportCard key={report.id} report={report} />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ReportCard({ report }: { report: Report }) {
  const statusColors = {
    PENDING:
      'bg-yellow-500/10 text-yellow-600 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-500/20',
    RESOLVED:
      'bg-green-500/10 text-green-600 border-green-200 dark:bg-green-500/20 dark:text-green-400 dark:border-green-500/20',
    DISMISSED:
      'bg-zinc-500/10 text-zinc-600 border-zinc-200 dark:bg-zinc-500/20 dark:text-zinc-500 dark:border-zinc-500/20',
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <Badge
              className={cn('border', statusColors[report.status as keyof typeof statusColors])}
            >
              {report.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              <TimeAgo date={report.createdAt} />
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Reported by:</span>
              <span className="text-foreground font-medium">
                {report.reporter?.name || report.reporter?.email || 'Unknown'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Message from:</span>
              <span className="text-foreground font-medium">
                {report.message.sender?.name || report.message.sender?.email || 'Unknown'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Thread:</span>
              <Link
                href={`/dashboard/threads/${report.message.thread.slug}`}
                className="text-brand hover:text-brand/80 underline"
              >
                {report.message.thread.name}
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-muted/50 rounded-xl p-4 mb-4 border border-border/50">
        <p className="text-xs text-muted-foreground mb-1">Reported Message:</p>
        <p className="text-sm text-foreground">{report.message.content}</p>
      </div>

      {report.status === 'PENDING' && <ReportActions reportId={report.id} currentStatus={report.status} />}

      {report.resolvedBy && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Resolved by {report.resolvedBy} on <TimeAgo date={report.updatedAt} />
          </p>
        </div>
      )}
    </div>
  );
}

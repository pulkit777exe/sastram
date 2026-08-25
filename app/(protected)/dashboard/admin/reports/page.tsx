import { assertAdmin } from '@/modules/auth';
import { getSession } from '@/modules/auth';
import { getReports } from '@/modules/reports/actions';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Flag, CheckCircle, Eye } from 'lucide-react';
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
    <div className="space-y-8">
      <header className="rounded-3xl border border-line bg-surface p-4 md:p-8 text-ink shadow-linear-xl">
        <p className="text-xs uppercase tracking-widest text-ink-3">Admin Workspace</p>
        <h1 className="mt-3 text-3xl font-semibold">Reports Management</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-3">
          Review and manage user reports to keep the community safe and respectful.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-surface border-line">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-ink-3">Total Reports</p>
                <p className="text-2xl font-bold text-ink mt-1">{reports.length}</p>
              </div>
              <Flag className="h-8 w-8 text-ink-3" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-surface border-line">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-ink-3">Pending</p>
                <p className="text-2xl font-bold text-yellow-500 mt-1">{pendingReports.length}</p>
              </div>
              <Eye className="h-8 w-8 text-yellow-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-surface border-line">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-ink-3">Resolved</p>
                <p className="text-2xl font-bold text-green-500 mt-1">{resolvedReports.length}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-ink mb-4">Pending Reports</h2>
          {pendingReports.length === 0 ? (
            <Card className="bg-surface border-line">
              <CardContent className="p-4 md:p-8 text-center">
                <p className="text-ink-3">No pending reports</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {pendingReports.map((report) => (
                <ReportCard key={report.id} report={report} />
              ))}
          </div>
          )}
      </div>

        {resolvedReports.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold text-ink mb-4">Resolved Reports</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
      'bg-field text-ink-3 border-line dark:bg-field dark:text-ink-3 dark:border-line',
  };

  return (
    <Card className="bg-surface border-line">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Badge
                className={cn('border', statusColors[report.status as keyof typeof statusColors])}
              >
                {report.status}
              </Badge>
              <span className="text-xs text-ink-3">
                <TimeAgo date={report.createdAt} />
              </span>
            </div>
            <p className="text-sm text-ink/80 mb-4">{report.status}</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-ink-3">Reported by:</span>
                <span className="text-ink font-medium">
                  {report.reporter?.name || report.reporter?.email || 'Unknown'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-ink-3">Message from:</span>
                <span className="text-ink font-medium">
                  {report.message.sender?.name || report.message.sender?.email || 'Unknown'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-ink-3">Thread:</span>
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

        <div className="bg-field rounded-control p-4 mb-4 border border-line/50">
          <p className="text-xs text-ink-3 mb-1">Reported Message:</p>
          <p className="text-sm text-ink">{report.message.content}</p>
        </div>

        {report.status === 'PENDING' && <ReportActions reportId={report.id} currentStatus={report.status} />}

        {report.resolvedBy && (
          <div className="mt-4 pt-4 border-t border-line">
            <p className="text-xs text-ink-3">
              Resolved by {report.resolvedBy} on <TimeAgo date={report.updatedAt} />
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

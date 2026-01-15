import { requireSession, assertAdmin } from "@/modules/auth/session";
import { getReports } from "@/modules/reports/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flag, CheckCircle, Eye } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ReportActions } from "@/components/admin/report-actions";
import { Report } from "@/modules/reports";
import { cn } from "@/lib/utils/cn";

export default async function ReportsPage() {
  const session = await requireSession();
  assertAdmin(session.user);

  const reports = await getReports();

  const pendingReports = reports.filter((r) => r.status === "PENDING");
  const resolvedReports = reports.filter(
    (r) => r.status === "RESOLVED" || r.status === "DISMISSED"
  );

  return (
    <div className="space-y-8">
      <header className="rounded-3xl border border-border bg-gradient-to-br from-indigo-950/50 to-background p-8 text-foreground shadow-xl">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Admin Workspace
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Reports Management</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Review and manage user reports to keep the community safe and
          respectful.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Reports</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {reports.length}
                </p>
              </div>
              <Flag className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-yellow-500 mt-1">
                  {pendingReports.length}
                </p>
              </div>
              <Eye className="h-8 w-8 text-yellow-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Resolved</p>
                <p className="text-2xl font-bold text-green-500 mt-1">
                  {resolvedReports.length}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-4">
            Pending Reports
          </h2>
          {pendingReports.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">No pending reports</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {pendingReports.map((report) => (
                <ReportCard key={report.id} report={report} />
              ))}
            </div>
          )}
        </div>

        {resolvedReports.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-4">
              Resolved Reports
            </h2>
            <div className="space-y-4">
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
      "bg-yellow-500/10 text-yellow-600 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-500/20",
    REVIEWING:
      "bg-blue-500/10 text-blue-600 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/20",
    RESOLVED:
      "bg-green-500/10 text-green-600 border-green-200 dark:bg-green-500/20 dark:text-green-400 dark:border-green-500/20",
    DISMISSED:
      "bg-zinc-500/10 text-zinc-600 border-zinc-200 dark:bg-zinc-500/20 dark:text-zinc-400 dark:border-zinc-500/20",
  };

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Badge
                className={cn(
                  "border",
                  statusColors[report.status as keyof typeof statusColors]
                )}
              >
                {report.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(report.createdAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
            <p className="text-sm text-foreground/80 mb-4">{report.status}</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Reported by:</span>
                <span className="text-foreground font-medium">
                  {report.reporter.name || report.reporter.email}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Message from:</span>
                <span className="text-foreground font-medium">
                  {report.message.sender.name || report.message.sender.email}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Thread:</span>
                <Link
                  href={`/dashboard/threads/thread/${report.message.section.slug}`}
                  className="text-indigo-500 hover:text-indigo-600 underline"
                >
                  {report.message.section.name}
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 mb-4 border border-border/50">
          <p className="text-xs text-muted-foreground mb-1">
            Reported Message:
          </p>
          <p className="text-sm text-foreground">{report.message.content}</p>
        </div>

        {report.status === "PENDING" && <ReportActions reportId={report.id} />}

        {report.resolver && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Resolved by {report.resolver.name || report.resolver.email} on{" "}
              {new Date(report.resolvedAt!).toLocaleDateString()}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

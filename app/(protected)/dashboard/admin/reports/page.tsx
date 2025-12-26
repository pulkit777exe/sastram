import { requireSession, assertAdmin } from "@/modules/auth/session";
import { getReports } from "@/modules/reports/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flag, CheckCircle, Eye } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ReportActions } from "@/components/admin/report-actions";

export default async function ReportsPage() {
  const session = await requireSession();
  assertAdmin(session.user);

  const reports = await getReports();

  const pendingReports = reports.filter((r) => r.status === "PENDING");
  const resolvedReports = reports.filter((r) => r.status === "RESOLVED" || r.status === "DISMISSED");

  return (
    <div className="space-y-8">
      <header className="rounded-4xl border border-zinc-800 bg-[radial-gradient(circle_at_top,#101322,#050507)] p-8 text-white shadow-xl">
        <p className="text-xs uppercase tracking-widest text-zinc-400">Admin Workspace</p>
        <h1 className="mt-3 text-3xl font-semibold">Reports Management</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-300">
          Review and manage user reports to keep the community safe and respectful.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-[#1C1C1E] border-zinc-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">Total Reports</p>
                <p className="text-2xl font-bold text-white mt-1">{reports.length}</p>
              </div>
              <Flag className="h-8 w-8 text-zinc-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#1C1C1E] border-zinc-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">Pending</p>
                <p className="text-2xl font-bold text-yellow-400 mt-1">{pendingReports.length}</p>
              </div>
              <Eye className="h-8 w-8 text-yellow-400/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#1C1C1E] border-zinc-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">Resolved</p>
                <p className="text-2xl font-bold text-green-400 mt-1">{resolvedReports.length}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-400/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-white mb-4">Pending Reports</h2>
          {pendingReports.length === 0 ? (
            <Card className="bg-[#1C1C1E] border-zinc-800">
              <CardContent className="p-8 text-center">
                <p className="text-zinc-400">No pending reports</p>
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
            <h2 className="text-xl font-semibold text-white mb-4">Resolved Reports</h2>
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

function ReportCard({ report }: { report: any }) {
  const statusColors = {
    PENDING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/20",
    REVIEWING: "bg-blue-500/20 text-blue-400 border-blue-500/20",
    RESOLVED: "bg-green-500/20 text-green-400 border-green-500/20",
    DISMISSED: "bg-zinc-500/20 text-zinc-400 border-zinc-500/20",
  };

  return (
    <Card className="bg-[#1C1C1E] border-zinc-800">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Badge className={statusColors[report.status as keyof typeof statusColors]}>
                {report.status}
              </Badge>
              <span className="text-xs text-zinc-500">
                {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
              </span>
            </div>
            <p className="text-sm text-zinc-300 mb-4">{report.reason}</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">Reported by:</span>
                <span className="text-white">{report.reporter.name || report.reporter.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">Message from:</span>
                <span className="text-white">{report.message.sender.name || report.message.sender.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">Thread:</span>
                <Link
                  href={`/dashboard/threads/thread/${report.message.section.slug}`}
                  className="text-indigo-400 hover:text-indigo-300 underline"
                >
                  {report.message.section.name}
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/50 rounded-lg p-4 mb-4">
          <p className="text-xs text-zinc-500 mb-1">Reported Message:</p>
          <p className="text-sm text-zinc-300">{report.message.content}</p>
        </div>

        {report.status === "PENDING" && (
          <ReportActions reportId={report.id} />
        )}

        {report.resolver && (
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <p className="text-xs text-zinc-500">
              Resolved by {report.resolver.name || report.resolver.email} on{" "}
              {new Date(report.resolvedAt!).toLocaleDateString()}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


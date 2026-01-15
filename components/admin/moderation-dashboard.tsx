"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ModerationQueue } from "./moderation-queue";
import { ReportReviewPanel } from "./report-review-panel";
import { AuditLogTable } from "./audit-log-table";
import { getReportWithContext } from "@/modules/reports/actions";
import type {
  ReportStats,
  ReportQueueItem,
  ReportWithContext,
  Report,
} from "@/modules/reports/types";
import { toast } from "sonner";

interface AuditLogEntry {
  id: string;
  timestamp: Date;
  action: string;
  target: string;
  category: string;
  performedBy: string;
}

interface ModerationDashboardProps {
  stats: ReportStats | null;
  reports: Report[];
  auditLog: AuditLogEntry[];
  moderator: {
    name: string;
    email: string;
    image?: string;
  };
}

export function ModerationDashboard({
  stats,
  reports: initialReports,
  auditLog,
  moderator,
}: ModerationDashboardProps) {
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] =
    useState<ReportWithContext | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);

  const queueItems: ReportQueueItem[] = initialReports.map((r) => ({
    id: r.id,
    category: r.category,
    priority: r.priority,
    status: r.status,
    createdAt: r.createdAt,
    reportCount: 1,
    message: {
      id: r.message.id,
      content: r.message.content,
      sender: {
        id: r.message.sender.id,
        name: r.message.sender.name,
      },
      section: {
        name: r.message.section.name,
        slug: r.message.section.slug,
      },
    },
    aiConfidence: null,
  }));

  const handleSelectReport = useCallback(async (reportId: string) => {
    setSelectedReportId(reportId);
    setIsLoadingReport(true);

    const result = await getReportWithContext(reportId);

    if (result && "success" in result && result.data) {
      setSelectedReport(result.data as unknown as ReportWithContext);
    } else if (result && "error" in result) {
      toast.error(result.error);
    }

    setIsLoadingReport(false);
  }, []);

  const handleAction = useCallback(
    async (action: string) => {
      if (!selectedReportId) return;

      toast.info(
        `Action "${action}" selected. Confirmation modal coming soon.`
      );
    },
    [selectedReportId]
  );

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!selectedReport) return;

      const key = e.key;
      const actions: Record<string, string> = {
        "1": "DISMISS",
        "2": "REMOVE_MESSAGE",
        "3": "WARN_USER",
        "4": "SUSPEND_USER",
        "5": "BAN_USER",
      };

      if (actions[key]) {
        e.preventDefault();
        handleAction(actions[key]);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedReport, handleAction]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="w-12 h-12">
              <AvatarImage src={moderator.image} />
              <AvatarFallback>
                {moderator.name?.charAt(0) || "M"}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-xs text-muted-foreground">Moderator</p>
              <h1 className="text-xl font-semibold text-foreground">
                {moderator.name}
              </h1>
              <p className="text-xs text-muted-foreground">{moderator.email}</p>
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              Moderation Queue
            </h2>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Queue (Left Side) */}
        <div className="xl:col-span-1">
          <ModerationQueue
            stats={stats}
            reports={queueItems}
            onSelectReport={handleSelectReport}
            selectedReportId={selectedReportId || undefined}
          />
        </div>

        {/* Review Panel (Right Side) */}
        <div className="xl:col-span-2">
          {selectedReport ? (
            <>
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-foreground">
                  Report Review: #{selectedReport.id.slice(-6).toUpperCase()} -{" "}
                  <span
                    className={
                      selectedReport.priority === "CRITICAL"
                        ? "text-red-400"
                        : selectedReport.priority === "HIGH"
                        ? "text-orange-400"
                        : "text-foreground"
                    }
                  >
                    {selectedReport.priority} PRIORITY
                  </span>
                </h2>
              </div>
              <ReportReviewPanel
                report={selectedReport}
                onAction={handleAction}
                isLoading={isLoadingReport}
              />
            </>
          ) : (
            <Card className="bg-card border-border h-full min-h-[400px] flex items-center justify-center">
              <CardContent className="text-center">
                <p className="text-muted-foreground">
                  Select a report from the queue to review
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Audit Log */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Recent Audit Log
        </h2>
        <AuditLogTable entries={auditLog} />
      </section>
    </div>
  );
}

"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Flag,
  AlertTriangle,
  AlertCircle,
  Clock,
  ChevronRight,
  Filter,
  Zap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils/cn";
import { REPORT_CATEGORY_LABELS } from "@/lib/config/constants";
import type { ReportStats, ReportQueueItem } from "@/modules/reports/types";

interface ModerationQueueProps {
  stats: ReportStats | null;
  reports: ReportQueueItem[];
  onSelectReport: (reportId: string) => void;
  selectedReportId?: string;
}

const priorityConfig = {
  CRITICAL: {
    label: "Critical",
    color: "bg-red-500/20 text-red-400 border-red-500/30",
    icon: AlertTriangle,
    iconColor: "text-red-500",
  },
  HIGH: {
    label: "High",
    color: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    icon: AlertCircle,
    iconColor: "text-orange-500",
  },
  MEDIUM: {
    label: "Medium",
    color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    icon: Clock,
    iconColor: "text-yellow-500",
  },
  LOW: {
    label: "Low",
    color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    icon: Clock,
    iconColor: "text-zinc-500",
  },
};

export function ModerationQueue({
  stats,
  reports,
  onSelectReport,
  selectedReportId,
}: ModerationQueueProps) {
  return (
    <div className="space-y-6">
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard
            label="Pending Reports"
            value={stats.pending}
            variant="default"
          />
          <StatsCard
            label="Critical Priority"
            value={stats.critical}
            variant="critical"
            badge="Red"
          />
          <StatsCard
            label="High Priority"
            value={stats.high}
            variant="high"
            badge="Orange"
          />
          <StatsCard
            label="Auto-Mod Actions"
            value={stats.autoModActions}
            variant="default"
            icon={<Zap className="w-4 h-4 text-muted-foreground" />}
          />
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Report Queue</h2>
        <div className="flex items-center gap-2">
          <Select defaultValue="all">
            <SelectTrigger className="w-[140px] h-8 text-sm bg-muted border-border">
              <Filter className="w-3.5 h-3.5 mr-2" />
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="all">All Reports</SelectItem>
              <SelectItem value="CRITICAL">Critical Only</SelectItem>
              <SelectItem value="HIGH">High Priority</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        {reports.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="p-8 text-center">
              <Flag className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">No reports in queue</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                All clear! Check back later.
              </p>
            </CardContent>
          </Card>
        ) : (
          reports.map((report) => {
            const config = priorityConfig[report.priority];
            const PriorityIcon = config.icon;

            return (
              <Card
                key={report.id}
                className={cn(
                  "bg-card border-border cursor-pointer transition-all hover:border-brand/50",
                  selectedReportId === report.id &&
                    "border-brand ring-1 ring-brand/20"
                )}
                onClick={() => onSelectReport(report.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div
                        className={cn(
                          "p-2 rounded-lg",
                          config.color.split(" ")[0]
                        )}
                      >
                        <PriorityIcon
                          className={cn("w-4 h-4", config.iconColor)}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={cn("text-xs", config.color)}>
                            {config.label}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-xs border-border"
                          >
                            {
                              REPORT_CATEGORY_LABELS[
                                report.category as keyof typeof REPORT_CATEGORY_LABELS
                              ]
                            }
                          </Badge>
                          {report.reportCount > 1 && (
                            <Badge variant="secondary" className="text-xs">
                              {report.reportCount} reports
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-foreground line-clamp-2 mb-1">
                          {report.message.content.substring(0, 150)}
                          {report.message.content.length > 150 && "..."}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            by {report.message.sender.name || "Unknown"}
                          </span>
                          <span>•</span>
                          <span>{report.message.section.name}</span>
                          <span>•</span>
                          <span>
                            {formatDistanceToNow(new Date(report.createdAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="shrink-0">
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                  {report.aiConfidence !== null && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          AI Confidence
                        </span>
                        <span
                          className={cn(
                            "font-medium",
                            report.aiConfidence > 0.8
                              ? "text-red-400"
                              : report.aiConfidence > 0.5
                              ? "text-orange-400"
                              : "text-muted-foreground"
                          )}
                        >
                          {Math.round(report.aiConfidence * 100)}%
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

function StatsCard({
  label,
  value,
  variant,
  badge,
  icon,
}: {
  label: string;
  value: number;
  variant: "default" | "critical" | "high";
  badge?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        "bg-card border-border",
        variant === "critical" && "border-red-500/30",
        variant === "high" && "border-orange-500/30"
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <div className="flex items-center gap-2 mt-1">
              <p
                className={cn(
                  "text-2xl font-bold",
                  variant === "critical" && "text-red-400",
                  variant === "high" && "text-orange-400",
                  variant === "default" && "text-foreground"
                )}
              >
                {value}
              </p>
              {badge && (
                <Badge
                  className={cn(
                    "text-[10px]",
                    variant === "critical" && "bg-red-500/20 text-red-400",
                    variant === "high" && "bg-orange-500/20 text-orange-400"
                  )}
                >
                  {badge}
                </Badge>
              )}
            </div>
          </div>
          {icon && <div className="p-2 rounded-lg bg-muted">{icon}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

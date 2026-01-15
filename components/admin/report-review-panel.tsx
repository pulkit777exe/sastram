"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Separator } from "@/components/ui/separator";
import {
  User,
  Calendar,
  Shield,
  AlertTriangle,
  Clock,
  MessageSquare,
  CheckCircle,
  XCircle,
  AlertCircle,
  Ban,
  Eye,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils/cn";
import type { ReportWithContext } from "@/modules/reports/types";

interface ReportReviewPanelProps {
  report: ReportWithContext;
  onAction: (action: string, data?: Record<string, unknown>) => void;
  isLoading?: boolean;
}

const actionButtons = [
  {
    key: "DISMISS",
    label: "Allow & Dismiss",
    shortcut: "1",
    icon: CheckCircle,
    variant: "outline" as const,
    description: "Mark as false positive",
  },
  {
    key: "REMOVE_MESSAGE",
    label: "Remove Message",
    shortcut: "2",
    icon: XCircle,
    variant: "outline" as const,
    description: "Hide from thread",
  },
  {
    key: "WARN_USER",
    label: "Remove + Warn",
    shortcut: "3",
    icon: AlertCircle,
    variant: "outline" as const,
    description: "Send official warning",
  },
  {
    key: "SUSPEND_USER",
    label: "Remove + Suspend",
    shortcut: "4",
    icon: Clock,
    variant: "outline" as const,
    description: "Temporary suspension",
  },
  {
    key: "BAN_USER",
    label: "Permanent Ban",
    shortcut: "5",
    icon: Ban,
    variant: "destructive" as const,
    description: "Ban user permanently",
  },
];

export function ReportReviewPanel({
  report,
  onAction,
  isLoading,
}: ReportReviewPanelProps) {
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  const userProfile = report.reportedUserProfile;
  const threadContext = report.threadContext;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Panel: Thread Context */}
      <Card className="bg-card border-border lg:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Thread Context
          </CardTitle>
          <div className="text-xs text-muted-foreground">
            {threadContext.threadTitle}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {threadContext.surroundingMessages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "p-3 rounded-lg text-sm",
                msg.isReported
                  ? "bg-red-500/10 border border-red-500/30"
                  : "bg-muted"
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={cn(
                    "font-medium text-xs",
                    msg.isReported ? "text-red-400" : "text-foreground"
                  )}
                >
                  {msg.senderName || "Unknown"}
                </span>
                {msg.isReported && (
                  <Badge className="text-[10px] bg-red-500/20 text-red-400">
                    Reported
                  </Badge>
                )}
              </div>
              <p
                className={cn(
                  "text-xs",
                  msg.isReported ? "text-red-300" : "text-muted-foreground"
                )}
              >
                {msg.content}
              </p>
              <div className="text-[10px] text-muted-foreground mt-1">
                {format(new Date(msg.createdAt), "h:mm a")}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Center Panel: Report Details */}
      <Card className="bg-card border-border lg:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Report Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Report Reasons */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2">
              Report Reasons
            </h4>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-border">
                {report.categoryLabel}
              </Badge>
              {report.reportCount > 1 && (
                <Badge variant="secondary">
                  +{report.reportCount - 1} more reports
                </Badge>
              )}
            </div>
          </div>

          {report.aiAnalysis && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Eye className="w-3 h-3" />
                AI Analysis
              </h4>
              <div className="bg-muted rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Toxicity
                  </span>
                  <Badge
                    className={cn(
                      "text-xs",
                      report.aiAnalysis.toxicityScore > 0.8
                        ? "bg-red-500/20 text-red-400"
                        : report.aiAnalysis.toxicityScore > 0.5
                        ? "bg-orange-500/20 text-orange-400"
                        : "bg-green-500/20 text-green-400"
                    )}
                  >
                    {(report.aiAnalysis.toxicityScore * 100).toFixed(0)}%
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {report.aiAnalysis.categories.map((cat) => (
                    <Badge
                      key={cat}
                      variant="outline"
                      className="text-[10px] border-border"
                    >
                      {cat}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          {report.similarReports.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">
                Similar Cases
              </h4>
              <div className="space-y-2">
                {report.similarReports.slice(0, 3).map((similar) => (
                  <div
                    key={similar.id}
                    className="text-xs text-muted-foreground flex items-center gap-2"
                  >
                    <span>•</span>
                    <span>{similar.category}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        similar.status === "RESOLVED" &&
                          "border-green-500/30 text-green-400",
                        similar.status === "DISMISSED" && "border-zinc-500/30"
                      )}
                    >
                      {similar.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border lg:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <User className="w-4 h-4" />
            User Profile: {userProfile.name || "Unknown"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* User Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Calendar className="w-3 h-3" />
                Account Age
              </div>
              <p className="text-sm font-medium text-foreground">
                {formatDistanceToNow(new Date(userProfile.createdAt))}
              </p>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Shield className="w-3 h-3" />
                Trust Score
              </div>
              <p
                className={cn(
                  "text-sm font-medium",
                  userProfile.trustScore > 70
                    ? "text-green-400"
                    : userProfile.trustScore > 40
                    ? "text-yellow-400"
                    : "text-red-400"
                )}
              >
                {userProfile.trustScore}/100
              </p>
            </div>
          </div>

          {userProfile.violationHistory.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Violation History ({userProfile.violationHistory.length}{" "}
                previous)
              </h4>
              <div className="space-y-2">
                {userProfile.violationHistory.slice(0, 3).map((violation) => (
                  <div
                    key={violation.id}
                    className="bg-red-500/5 border border-red-500/20 rounded-lg p-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-red-400">
                        {violation.action}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(violation.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {violation.reason}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator className="bg-border" />

          <div className="space-y-2">
            {actionButtons.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.key}
                  variant={action.variant}
                  size="sm"
                  className={cn(
                    "w-full justify-start text-xs",
                    selectedAction === action.key && "ring-2 ring-brand"
                  )}
                  onClick={() => {
                    setSelectedAction(action.key);
                    onAction(action.key);
                  }}
                  disabled={isLoading}
                >
                  <Icon className="w-3.5 h-3.5 mr-2" />
                  <span className="flex-1 text-left">{action.label}</span>
                  <kbd className="ml-auto text-[10px] bg-background/50 px-1.5 py-0.5 rounded border border-border">
                    {action.shortcut}
                  </kbd>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

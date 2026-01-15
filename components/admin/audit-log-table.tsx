"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils/cn";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface AuditLogEntry {
  id: string;
  timestamp: Date;
  action: string;
  target: string;
  category: string;
  performedBy: string;
}

interface AuditLogTableProps {
  entries: AuditLogEntry[];
}

const actionColors: Record<string, string> = {
  MESSAGE_DELETED: "bg-red-500/20 text-red-400",
  USER_BANNED: "bg-red-500/20 text-red-400",
  USER_WARNED: "bg-orange-500/20 text-orange-400",
  USER_SUSPENDED: "bg-orange-500/20 text-orange-400",
  REPORT_RESOLVED: "bg-green-500/20 text-green-400",
  REPORT_DISMISSED: "bg-zinc-500/20 text-zinc-400",
  APPEAL_APPROVED: "bg-green-500/20 text-green-400",
  APPEAL_DENIED: "bg-red-500/20 text-red-400",
};

export function AuditLogTable({ entries }: AuditLogTableProps) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No recent moderation actions
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="text-muted-foreground">Time</TableHead>
            <TableHead className="text-muted-foreground">Action</TableHead>
            <TableHead className="text-muted-foreground">Category</TableHead>
            <TableHead className="text-muted-foreground">Target</TableHead>
            <TableHead className="text-muted-foreground">
              Performed By
            </TableHead>
            <TableHead className="text-right text-muted-foreground"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id} className="border-border">
              <TableCell className="text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(entry.timestamp), {
                  addSuffix: true,
                })}
              </TableCell>
              <TableCell>
                <Badge
                  className={cn(
                    "text-xs",
                    actionColors[entry.action] ||
                      "bg-muted text-muted-foreground"
                  )}
                >
                  {entry.action.replace(/_/g, " ")}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-foreground">
                {entry.category}
              </TableCell>
              <TableCell className="text-sm text-foreground">
                {entry.target}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {entry.performedBy}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

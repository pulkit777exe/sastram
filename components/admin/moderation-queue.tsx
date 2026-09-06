'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Flag, ChevronRight, Filter, Zap } from 'lucide-react';
import TimeAgo from '@/components/ui/TimeAgo';
import { cn } from '@/lib/utils/cn';
import { REPORT_CATEGORY_LABELS } from '@/lib/config/constants';
import type { ReportStats, ReportQueueItem } from '@/modules/reports/types';

function getConfidenceColor(confidence: number): string {
  if (confidence > 0.8) return 'text-red-400';
  if (confidence > 0.5) return 'text-orange-400';
  return 'text-muted-foreground';
}

function getVariantValueColor(variant: 'default' | 'critical' | 'high'): string {
  if (variant === 'critical') return 'text-red-400';
  if (variant === 'high') return 'text-orange-400';
  return 'text-foreground';
}

function getVariantBorder(variant: 'default' | 'critical' | 'high'): string {
  if (variant === 'critical') return 'border-red-500/30';
  if (variant === 'high') return 'border-orange-500/30';
  return '';
}

function getVariantBadgeColor(variant: 'default' | 'critical' | 'high'): string {
  if (variant === 'critical') return 'bg-red-500/20 text-red-400';
  if (variant === 'high') return 'bg-orange-500/20 text-orange-400';
  return '';
}

interface ModerationQueueProps {
  stats: ReportStats | null;
  reports: ReportQueueItem[];
  onSelectReport: (reportId: string) => void;
  selectedReportId?: string;
}

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
          <StatsCard label="Pending Reports" value={stats.pending} variant="default" />
          <StatsCard
            label="Critical Priority"
            value={stats.critical}
            variant="critical"
            badge="Red"
          />
          <StatsCard label="High Priority" value={stats.high} variant="high" badge="Orange" />
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
            <SelectTrigger className="w-36 h-8 text-sm bg-muted border-line">
              <Filter className="w-3.5 h-3.5 mr-2" />
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-line">
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
          <Card className="bg-surface border-line">
            <CardContent className="p-8 text-center">
              <Flag className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">No reports in queue</p>
              <p className="text-sm text-muted-foreground/70 mt-1">All clear! Check back later.</p>
            </CardContent>
          </Card>
        ) : (
          reports.map((report) => {
            return (
              <Card
                key={report.id}
                className={cn(
                  'bg-surface border-line cursor-pointer transition-all hover:border-brand/50',
                  selectedReportId === report.id && 'border-brand ring-1 ring-brand/20'
                )}
                onClick={() => onSelectReport(report.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs border-line">
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
                          {report.message.content.length > 150 && '...'}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>by {report.message.sender.name || 'Unknown'}</span>
                          <span>•</span>
                          <span>{report.message.thread.name}</span>
                          <span>•</span>
                          <span>
                            <TimeAgo date={report.createdAt} />
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="icon-sm" className="shrink-0">
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                    {report.aiConfidence !== null && (
                    <div className="mt-3 pt-3 border-t border-line">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Sai Confidence</span>
                        <span className={cn('font-medium', getConfidenceColor(report.aiConfidence))}>
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
  variant: 'default' | 'critical' | 'high';
  badge?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card className={cn('bg-surface border-line', getVariantBorder(variant))}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <div className="flex items-center gap-2 mt-1">
              <p className={cn('text-2xl font-bold', getVariantValueColor(variant))}>{value}</p>
              {badge && <Badge className={cn('text-xs', getVariantBadgeColor(variant))}>{badge}</Badge>}
            </div>
          </div>
          {icon && <div className="p-2 rounded-control bg-muted">{icon}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

'use client';

import { Activity, Clock, Search, FileText, GitBranch, Brain, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';
import { motion, AnimatePresence } from 'motion/react';

export type ActivityStatus = 'pending' | 'active' | 'complete' | 'error';

export interface ActivityItem {
  id: string;
  type: 'search' | 'read' | 'analyze' | 'plan' | 'synthesize' | 'verify' | 'thought';
  title: string;
  description?: string;
  status: ActivityStatus;
  timestamp: Date | string | number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

interface ActivityFeedProps {
  activities: ActivityItem[];
  maxItems?: number;
  showTimestamp?: boolean;
  className?: string;
}

const activityIcons = {
  search: Search,
  read: FileText,
  analyze: Brain,
  plan: GitBranch,
  synthesize: Brain,
  verify: CheckCircle2,
  thought: Activity,
};

const statusConfig = {
  pending: {
    icon: Clock,
    className: 'text-ink-3',
    bgClassName: 'bg-surface-2',
  },
  active: {
    icon: Activity,
    className: 'text-brand',
    bgClassName: 'bg-brand/10',
  },
  complete: {
    icon: CheckCircle2,
    className: 'text-emerald-500',
    bgClassName: 'bg-emerald-500/10',
  },
  error: {
    icon: AlertCircle,
    className: 'text-red-500',
    bgClassName: 'bg-red-500/10',
  },
};

function formatTimestamp(timestamp: Date | string | number) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(seconds?: number) {
  if (!seconds) return null;
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
}

export function ActivityFeed({
  activities,
  maxItems,
  showTimestamp = true,
  className,
}: ActivityFeedProps) {
  const displayedActivities = maxItems ? activities.slice(0, maxItems) : activities;

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-brand" />
          Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative space-y-0">
          {displayedActivities.length === 0 ? (
            <p className="text-sm text-ink-3 text-center py-4">No activity yet</p>
          ) : (
            <AnimatePresence initial={false}>
              {displayedActivities.map((activity, index) => {
                const ActivityIcon = activityIcons[activity.type] || Activity;
                const status = statusConfig[activity.status];
                const StatusIcon = status.icon;
                const isLast = index === displayedActivities.length - 1;
                const duration = formatDuration(activity.duration);

                return (
                  <motion.div
                    key={activity.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2, delay: index * 0.03 }}
                    className="relative flex gap-3 pb-4 last:pb-0"
                  >
                    {!isLast && (
                      <div className="absolute left-4 top-8 bottom-0 w-px bg-line/40" />
                    )}
                    <div
                      className={cn(
                        'relative z-10 h-8 w-8 rounded-full flex items-center justify-center shrink-0',
                        status.bgClassName
                      )}
                    >
                      <ActivityIcon className={cn('h-4 w-4', status.className)} />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p
                            className={cn(
                              'text-sm',
                              activity.status === 'active' ? 'text-ink font-medium' : 'text-ink-2'
                            )}
                          >
                            {activity.title}
                          </p>
                          {activity.description ? (
                            <p className="text-xs text-ink-3 mt-0.5 line-clamp-2">
                              {activity.description}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-ink-3 shrink-0">
                          {duration ? <span className="font-mono">{duration}</span> : null}
                          {showTimestamp ? (
                            <span className="font-mono">{formatTimestamp(activity.timestamp)}</span>
                          ) : null}
                          {activity.status !== 'pending' && activity.status !== 'active' ? (
                            <StatusIcon className={cn('h-3 w-3', status.className)} />
                          ) : activity.status === 'active' ? (
                            <motion.div
                              animate={{ opacity: [0.4, 1, 0.4] }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                            >
                              <StatusIcon className={cn('h-3 w-3', status.className)} />
                            </motion.div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

'use client';

import { Check, Loader2, AlertCircle, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';
import { motion, AnimatePresence } from 'motion/react';

export interface ResearchSubTask {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'complete' | 'error';
  duration?: number;
}

export interface ResearchPhase {
  id: string;
  label: string;
  description: string;
  status: 'pending' | 'active' | 'complete' | 'error';
  subTasks?: ResearchSubTask[];
  estimatedMinutes?: number;
}

interface ProgressRailProps {
  phases: ResearchPhase[];
  totalElapsed: number;
  estimatedTotal?: number;
  className?: string;
}

function formatTime(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins === 0 ? `${hours}h` : `${hours}h ${remMins}m`;
}

export function ProgressRail({ phases, totalElapsed, estimatedTotal, className }: ProgressRailProps) {
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const progress = estimatedTotal && estimatedTotal > 0 ? Math.min((totalElapsed / estimatedTotal) * 100, 98) : 0;

  const togglePhase = (phaseId: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  };

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Research Progress</CardTitle>
          <div className="flex items-center gap-2 text-xs text-ink-3 font-mono">
            <Clock size={12} />
            <span>{formatTime(totalElapsed)}</span>
            {estimatedTotal ? <span>/ ~{formatTime(estimatedTotal)}</span> : null}
          </div>
        </div>
        {estimatedTotal && estimatedTotal > 0 ? (
          <div className="mt-2 h-1.5 w-full bg-line/40 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-brand"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-1">
        {phases.map((phase) => {
          const expanded = expandedPhases.has(phase.id);
          const hasSubtasks = phase.subTasks && phase.subTasks.length > 0;
          return (
            <div key={phase.id} className="rounded-card border border-line/60 overflow-hidden">
              <button
                type="button"
                onClick={() => hasSubtasks && togglePhase(phase.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 text-left',
                  hasSubtasks ? 'hover:bg-hover/40 cursor-pointer' : 'cursor-default'
                )}
              >
                <div className="shrink-0">
                  {phase.status === 'complete' ? (
                    <div className="h-5 w-5 rounded-full bg-emerald-500/10 flex items-center justify-center">
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    </div>
                  ) : phase.status === 'active' ? (
                    <div className="h-5 w-5 rounded-full bg-brand/10 flex items-center justify-center">
                      <Loader2 className="h-3.5 w-3.5 text-brand animate-spin" />
                    </div>
                  ) : phase.status === 'error' ? (
                    <div className="h-5 w-5 rounded-full bg-red-500/10 flex items-center justify-center">
                      <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                    </div>
                  ) : (
                    <div className="h-5 w-5 rounded-full border border-line flex items-center justify-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-ink-3" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn('text-sm', phase.status === 'active' ? 'text-ink font-medium' : 'text-ink-2')}>
                      {phase.label}
                    </p>
                    {hasSubtasks ? (
                      expanded ? <ChevronDown className="h-3.5 w-3.5 text-ink-3" /> : <ChevronRight className="h-3.5 w-3.5 text-ink-3" />
                    ) : null}
                  </div>
                  <p className="text-xs text-ink-3 truncate">{phase.description}</p>
                </div>
              </button>
              <AnimatePresence initial={false}>
                {expanded && hasSubtasks ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-line/60 bg-surface-2/30"
                  >
                    <div className="px-3 py-2 space-y-1.5">
                      {phase.subTasks!.map((task) => (
                        <div key={task.id} className="flex items-center gap-2 text-xs">
                          <div className="w-5 flex justify-center">
                            {task.status === 'complete' ? (
                              <Check className="h-3 w-3 text-emerald-500" />
                            ) : task.status === 'active' ? (
                              <Loader2 className="h-3 w-3 text-brand animate-spin" />
                            ) : task.status === 'error' ? (
                              <AlertCircle className="h-3 w-3 text-red-500" />
                            ) : (
                              <div className="h-1.5 w-1.5 rounded-full bg-ink-4" />
                            )}
                          </div>
                          <span className={cn(task.status === 'active' ? 'text-ink' : 'text-ink-3')}>{task.label}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

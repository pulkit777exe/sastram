'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, AlertCircle, RefreshCw, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export type SSEPhase =
  | 'searching'
  | 'reading'
  | 'crossref'
  | 'synthesizing'
  | 'done'
  | 'error';

interface PhaseTrackerProps {
  currentPhase: SSEPhase;
  /** Optional start timestamp (Date.now()) to keep total timing accurate across re-renders */
  startTime?: number;
}

const PHASES: { key: SSEPhase; label: string; description: string }[] = [
  { key: 'searching', label: 'Search', description: 'Querying sources' },
  { key: 'reading', label: 'Reading', description: 'Extracting content' },
  { key: 'crossref', label: 'Cross-ref', description: 'Verifying facts' },
  { key: 'synthesizing', label: 'Synthesize', description: 'Formulating answer' },
];

const TERMINAL_PHASES: SSEPhase[] = ['done', 'error'];

function formatDuration(seconds: number): string {
  if (seconds < 1) return '<1s';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

export function PhaseTracker({ currentPhase, startTime }: PhaseTrackerProps) {
  const isTerminal = TERMINAL_PHASES.includes(currentPhase);
  const currentIndex = isTerminal
    ? PHASES.length
    : PHASES.findIndex((p) => p.key === currentPhase);

  // Store initial start timestamp without calling Date.now() during render
  const initialTimeRef = useRef<number | null>(startTime ?? null);
  const phaseStartTimeRef = useRef<number | null>(null);

  // Track elapsed time per phase key in seconds
  const [phaseDurations, setPhaseDurations] = useState<Partial<Record<SSEPhase, number>>>({});
  const [totalElapsed, setTotalElapsed] = useState<number>(0);

  useEffect(() => {
    // Safely assign side-effectual timestamps inside useEffect (runs after render)
    const now = Date.now();
    if (initialTimeRef.current === null) {
      initialTimeRef.current = now;
    }
    phaseStartTimeRef.current = now;

    if (isTerminal) return;

    const interval = setInterval(() => {
      const currentTime = Date.now();
      const currentPhaseElapsed = Math.floor(
        (currentTime - (phaseStartTimeRef.current ?? currentTime)) / 1000
      );
      const overallElapsed = Math.floor(
        (currentTime - (initialTimeRef.current ?? currentTime)) / 1000
      );

      setTotalElapsed(overallElapsed);
      setPhaseDurations((prev) => ({
        ...prev,
        [currentPhase]: currentPhaseElapsed,
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [currentPhase, isTerminal]);

  return (
    <div className="w-full space-y-2 rounded-card border border-line/50 bg-surface/60 p-3 shadow-xs backdrop-blur-xs">
      {/* Header bar with total time elapsed */}
      <div className="flex items-center justify-between text-xs font-medium text-ink-3 px-1">
        <span className="flex items-center gap-1.5 font-semibold text-ink">
          Processing Request
        </span>
        <span className="flex items-center gap-1 text-ink-3/80 font-mono">
          <Clock size={12} className="shrink-0" />
          {formatDuration(totalElapsed)}
        </span>
      </div>

      {/* Main Stepper Bar */}
      <div
        className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none"
        role="progressbar"
        aria-valuenow={Math.min(currentIndex, PHASES.length)}
        aria-valuemax={PHASES.length}
      >
        {PHASES.map((phase, index) => {
          const isDone = index < currentIndex;
          const isActive = index === currentIndex && !isTerminal;
          const duration = phaseDurations[phase.key];

          return (
            <div key={phase.key} className="flex items-center gap-1.5 flex-1 min-w-25">
              <div
                className={`group relative flex w-full flex-col items-start gap-0.5 rounded-control border px-2.5 py-1.5 transition-all duration-300 ${
                  isDone
                    ? 'border-emerald-500/20 bg-emerald-500/5 text-foreground'
                    : isActive
                    ? 'border-primary/40 bg-primary/10 ring-2 ring-primary/20 text-foreground'
                    : 'border-line/40 bg-muted/20 text-muted-foreground/50'
                }`}
              >
                <div className="flex w-full items-center justify-between gap-1 text-xs font-medium">
                  <span className="flex items-center gap-1.5 truncate">
                    {isDone && <Check size={12} className="shrink-0 text-emerald-500" />}
                    {isActive && <Loader2 size={12} className="shrink-0 animate-spin text-primary" />}
                    <span className="truncate">{phase.label}</span>
                  </span>

                  {/* Phase Timer Badge */}
                  {duration !== undefined && duration > 0 && (
                    <span className="font-mono text-[10px] opacity-70">
                      {formatDuration(duration)}
                    </span>
                  )}
                </div>
              </div>

              {/* Step Separator Arrow / Bar */}
              {index < PHASES.length - 1 && (
                <div
                  className={`h-0.5 w-3 rounded-full transition-colors duration-300 ${
                    index < currentIndex ? 'bg-emerald-500/40' : 'bg-border/40'
                  }`}
                />
              )}
            </div>
          );
        })}

        {/* Terminal States */}
        {currentPhase === 'done' && (
          <Badge
            variant="default"
            className="flex shrink-0 items-center gap-1 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 px-3 py-1.5 text-xs font-medium"
          >
            <Check size={12} className="shrink-0" />
            Complete
          </Badge>
        )}

        {currentPhase === 'error' && (
          <Badge
            variant="destructive"
            className="flex shrink-0 items-center gap-1 px-3 py-1.5 text-xs font-medium"
          >
            <AlertCircle size={12} className="shrink-0" />
            Failed
          </Badge>
        )}
      </div>
    </div>
  );
}
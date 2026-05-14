'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

type Phase = 'classify' | 'search' | 'crossref' | 'synthesize' | 'done';

interface PhaseTrackerProps {
  currentPhase: Phase;
  startTime: number;
}

const PHASES: { key: Phase; label: string }[] = [
  { key: 'classify', label: 'Classify' },
  { key: 'search', label: 'Search' },
  { key: 'crossref', label: 'Cross-ref' },
  { key: 'synthesize', label: 'Synthesize' },
  { key: 'done', label: 'Done' },
];

function getPhaseIndex(phase: Phase): number {
  return PHASES.findIndex((p) => p.key === phase);
}

export function PhaseTracker({ currentPhase, startTime }: PhaseTrackerProps) {
  const [elapsed, setElapsed] = useState(() => Date.now() - startTime);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentIndex = getPhaseIndex(currentPhase);

  useEffect(() => {
    // Cleanup previous interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (currentPhase === 'done') return;

    // Live counter
    intervalRef.current = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 100);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [currentPhase, startTime]);

  const formatTime = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

  return (
    <div
      className="flex items-center gap-1 w-full max-w-xl"
      role="progressbar"
      aria-valuenow={currentIndex}
      aria-valuemax={PHASES.length - 1}
    >
      {PHASES.map((phase, index) => {
        const isDone = index < currentIndex || (phase.key === 'done' && currentPhase === 'done');
        const isActive = index === currentIndex && currentPhase !== 'done';
        const isPending =
          index > currentIndex && !(phase.key === 'done' && currentPhase === 'done');

        return (
          <div key={phase.key} className="flex items-center gap-1 flex-1">
            <div
              className={`
                flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                transition-all duration-300 w-full
                ${isDone ? 'bg-foreground/10 text-foreground' : ''}
                ${isActive ? 'bg-foreground text-background animate-pulse' : ''}
                ${isPending ? 'bg-muted text-muted-foreground/50' : ''}
              `}
            >
              {isDone && <Check size={12} className="shrink-0" />}
              {isActive && <Loader2 size={12} className="shrink-0 animate-spin" />}
              <span className="truncate">{phase.label}</span>
              {phase.key === 'done' && currentPhase === 'done' && (
                <span className="text-[10px] opacity-70 ml-0.5 tabular-nums">
                  {formatTime(elapsed)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

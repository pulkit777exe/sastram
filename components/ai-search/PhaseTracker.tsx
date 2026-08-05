'use client';

import { Check, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export type SSEPhase = 'searching' | 'reading' | 'crossref' | 'synthesizing' | 'done' | 'refine' | 'error';

interface PhaseTrackerProps {
  currentPhase: SSEPhase;
}

const PHASES: { key: SSEPhase; label: string }[] = [
  { key: 'searching', label: 'Search' },
  { key: 'reading', label: 'Reading' },
  { key: 'crossref', label: 'Cross-ref' },
  { key: 'synthesizing', label: 'Synthesize' },
];

const TERMINAL_PHASES: SSEPhase[] = ['done', 'refine', 'error'];

function getPhaseIndex(phase: SSEPhase): number {
  if (TERMINAL_PHASES.includes(phase)) {
    return PHASES.length;
  }
  return PHASES.findIndex((p) => p.key === phase);
}

export function PhaseTracker({ currentPhase }: PhaseTrackerProps) {
  const currentIndex = getPhaseIndex(currentPhase);
  const isDone = currentPhase === 'done';
  const isRefine = currentPhase === 'refine';
  const isTerminal = TERMINAL_PHASES.includes(currentPhase);

  return (
    <div className="w-full overflow-x-auto">
      <div
        className="flex items-center gap-1 min-w-max"
        role="progressbar"
        aria-valuenow={Math.min(currentIndex, PHASES.length)}
        aria-valuemax={PHASES.length}
      >
      {PHASES.map((phase, index) => {
        const phaseDone = index < currentIndex;
        const isActive = index === currentIndex && !isTerminal;

        return (
          <div key={phase.key} className="flex items-center gap-1 flex-1">
            <Badge
              variant={phaseDone ? 'secondary' : isActive ? 'live' : 'outline'}
              className={`w-full justify-center px-3 py-1.5 text-xs transition-all duration-300 ${isActive ? 'animate-pulse' : ''} ${index > currentIndex && !isTerminal ? 'text-muted-foreground/50' : ''}`}
            >
              {phaseDone && <Check size={12} className="shrink-0" />}
              {isActive && <Loader2 size={12} className="shrink-0 animate-spin" />}
              <span className="truncate">{phase.label}</span>
            </Badge>
          </div>
        );
      })}

      {/* Single terminal pill: either Done (green) or Refine needed (orange) — never both. */}
      {isDone && (
        <Badge variant="success" className="px-3 py-1.5 text-xs shrink-0">
          <Check size={12} className="shrink-0" />
          Done
        </Badge>
      )}
      {isRefine && (
        <Badge variant="warning" className="px-3 py-1.5 text-xs shrink-0">
          Refine needed
        </Badge>
      )}
    </div>
    </div>
  );
}

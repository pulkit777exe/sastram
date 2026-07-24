'use client';

import { useEffect, useState, useRef } from 'react';
import {
  Search,
  BookOpen,
  GitCompare,
  Sparkles,
  Check,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { SSEPhase } from './PhaseTracker';

export interface StepLogEntry {
  phase: SSEPhase;
  at: number;
  sourceCount: number;
}

interface ThinkingTraceProps {
  query: string;
  currentPhase: SSEPhase;
  steps: StepLogEntry[];
  sourceCount: number;
  startedAt: number;
  completedAt?: number;
  isLoading: boolean;
}

const PHASE_ORDER: Exclude<SSEPhase, 'done' | 'refine' | 'error'>[] = [
  'searching',
  'reading',
  'crossref',
  'synthesizing',
];

const STEP_CONFIG: Record<
  (typeof PHASE_ORDER)[number],
  { label: string; icon: typeof Search; describe: (sourceCount: number, query: string) => string }
> = {
  searching: {
    label: 'Searching',
    icon: Search,
    describe: (_n, q) => `Searching the web for "${q}"`,
  },
  reading: {
    label: 'Reading',
    icon: BookOpen,
    describe: (n) => `Reading ${n} source${n !== 1 ? 's' : ''}`,
  },
  crossref: {
    label: 'Cross-referencing',
    icon: GitCompare,
    describe: (n) => `Cross-referencing ${n} source${n !== 1 ? 's' : ''} for conflicts`,
  },
  synthesizing: {
    label: 'Synthesizing',
    icon: Sparkles,
    describe: () => 'Writing the answer',
  },
};

function formatElapsed(ms: number): string {
  const seconds = ms / 1000;
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}

export function ThinkingTrace({
  query,
  currentPhase,
  steps,
  sourceCount,
  startedAt,
  completedAt,
  isLoading,
}: ThinkingTraceProps) {
  const [expanded, setExpanded] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const prevLoadingRef = useRef(isLoading);

  useEffect(() => {
    if (isLoading && !prevLoadingRef.current) setExpanded(true);
    prevLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [isLoading]);

  const elapsedMs = (completedAt ?? now) - startedAt;
  const isDone = completedAt !== undefined;

  const stepFor = (phase: (typeof PHASE_ORDER)[number]) => steps.find((s) => s.phase === phase);
  const currentIndex = PHASE_ORDER.indexOf(currentPhase as (typeof PHASE_ORDER)[number]);

  return (
    <div className="w-full bg-card border border-border rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-foreground/2 transition-colors"
        aria-expanded={expanded}
      >
        {isDone ? (
          <Check size={15} className="text-emerald-500 shrink-0" />
        ) : (
          <Loader2 size={15} className="text-foreground animate-spin shrink-0" />
        )}
        <span className="text-sm text-foreground/90 flex-1 truncate">
          {isDone
            ? `Thought for ${formatElapsed(elapsedMs)} · ${sourceCount} source${sourceCount !== 1 ? 's' : ''}`
            : STEP_CONFIG[currentPhase as (typeof PHASE_ORDER)[number]]?.describe(sourceCount, query) ??
              'Thinking…'}
        </span>
        {!isDone && (
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {formatElapsed(elapsedMs)}
          </span>
        )}
        {expanded ? (
          <ChevronUp size={14} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown size={14} className="text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1">
          <div className="relative pl-1">
            {PHASE_ORDER.map((phase, i) => {
              const config = STEP_CONFIG[phase];
              const Icon = config.icon;
              const entry = stepFor(phase);
              const reached = entry !== undefined;
              const isCurrent = phase === currentPhase && !isDone;
              const isLast = i === PHASE_ORDER.length - 1;
              const relativeMs = entry ? entry.at - startedAt : null;

              return (
                <div key={phase} className="relative flex gap-3 pb-4 last:pb-0">
                  {!isLast && (
                    <span
                      className={`absolute left-3 top-6 bottom-0 w-px ${
                        reached && i < currentIndex + (isDone ? 1 : 0) ? 'bg-foreground/20' : 'bg-border'
                      }`}
                    />
                  )}
                  <span
                    className={`relative z-10 flex items-center justify-center w-5.5 h-5.5 rounded-full border shrink-0 ${
                      isCurrent
                        ? 'bg-foreground text-background border-foreground animate-pulse'
                        : reached
                          ? 'bg-foreground/10 text-foreground border-foreground/20'
                          : 'bg-muted text-muted-foreground/40 border-border'
                    }`}
                  >
                    {reached && !isCurrent ? <Check size={11} /> : <Icon size={11} />}
                  </span>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-medium ${
                          reached ? 'text-foreground' : 'text-muted-foreground/50'
                        }`}
                      >
                        {config.label}
                      </span>
                      {relativeMs !== null && (
                        <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                          +{formatElapsed(relativeMs)}
                        </span>
                      )}
                    </div>
                    {reached && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {config.describe(entry?.sourceCount ?? sourceCount, query)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

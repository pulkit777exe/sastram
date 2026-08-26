'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { SSEPhase } from './PhaseTracker';
import { Button } from '@/components/ui/button';

/* ─────────────────────────────────────────────────────────
 * THINKING STATE — expandable agent trace
 *
 * Props-driven (no internal demo timers) so it maps cleanly
 * to SearchPage's SSEPhase / stepLog state machine.
 * ───────────────────────────────────────────────────────── */

export interface ThinkingStep {
  phase: SSEPhase;
  at: number;
  sourceCount: number;
}

interface ThinkingStateProps {
  query: string;
  currentPhase: SSEPhase;
  steps: ThinkingStep[];
  sourceCount: number;
  startedAt: number;
  completedAt?: number;
  isLoading: boolean;
}

const PHASES: Exclude<SSEPhase, 'done' | 'error'>[] = [
  'searching',
  'reading',
  'crossref',
  'synthesizing',
];

const PHASE_CONFIG: Record<
  (typeof PHASES)[number],
  { label: string; describe: (n: number, q: string) => string }
> = {
  searching:    { label: 'Searching',          describe: (_n, q) => `Searching the web for "${q}"` },
  reading:      { label: 'Reading',            describe: (n)    => `Reading ${n} source${n !== 1 ? 's' : ''}` },
  crossref:     { label: 'Cross-referencing',  describe: (n)    => `Cross-referencing ${n} source${n !== 1 ? 's' : ''} for conflicts` },
  synthesizing: { label: 'Synthesizing',       describe: ()     => 'Writing the answer' },
};

const PHASE_ACTIVE_LABEL: Record<SSEPhase, string> = {
  searching:    'Searching the web',
  reading:      'Reading sources',
  crossref:     'Cross-referencing',
  synthesizing: 'Writing answer',
  done:         'Done',
  error:        'Error',
};

function formatElapsed(ms: number): string {
  const s = ms / 1000;
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

import { LoadingState } from './LoadingState';

export function ThinkingState({
  query,
  currentPhase,
  steps,
  sourceCount,
  startedAt,
  completedAt,
  isLoading,
}: ThinkingStateProps) {
  const isDone = completedAt !== undefined;
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const traceRef = useRef<HTMLDivElement>(null);
  const [lineHeight, setLineHeight] = useState(0);

  // Keep elapsed ticking while loading
  useState(() => {
    if (!isLoading) return;
    const id = setInterval(() => setNow(Date.now()), 300);
    return () => clearInterval(id);
  });

  // Auto-expand while loading, collapse to summary when done
  const autoExpanded = isLoading && !isDone;
  const expanded = manualExpanded ?? autoExpanded;

  useLayoutEffect(() => {
    if (traceRef.current) setLineHeight(traceRef.current.offsetHeight);
  }, [steps.length, expanded]);

  const elapsedMs = (completedAt ?? now) - startedAt;
  const stepFor = (phase: (typeof PHASES)[number]) =>
    steps.find((s) => s.phase === phase);
  const currentIndex = PHASES.indexOf(currentPhase as (typeof PHASES)[number]);

  const doneLabel = isDone
    ? `Thought for ${formatElapsed(elapsedMs)} · ${sourceCount} source${sourceCount !== 1 ? 's' : ''}`
    : null;

  const activeLabel = PHASE_ACTIVE_LABEL[currentPhase] ?? 'Thinking';

  return (
    <div className="flex w-full flex-col">
      {/* Header toggle */}
      <Button
        type="button"
        aria-expanded={expanded}
        onClick={() => setManualExpanded((v) => !(v ?? autoExpanded))}
        variant="ghost"
        className="-mx-1.5 w-fit items-center gap-2 rounded-control px-1.5 py-1 h-auto"
      >
        {isLoading && !isDone ? (
          <LoadingState label={activeLabel} variant="Drive" />
        ) : (
          <>
            {/* Star / sparkle icon */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="var(--ink-3)"
              className="shrink-0"
            >
              <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
            </svg>

            <span
              className="text-[13px] font-medium whitespace-nowrap text-ink-2"
              style={{ animation: 'fade-in 350ms ease-out both' }}
            >
              {doneLabel ?? activeLabel}
            </span>
          </>
        )}

        {/* Chevron */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ink-3)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform duration-300 shrink-0"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </Button>

      {/* Expandable trace body */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-400"
        style={{
          gridTemplateRows: expanded ? '1fr' : '0fr',
          opacity: expanded ? 1 : 0,
          transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      >
        <div className="overflow-hidden">
          <div className="relative mt-1 ml-[5px] pl-4">
            {/* Vertical guide line */}
            <span
              aria-hidden
              className="absolute left-[3px] w-px bg-line"
              style={{
                top: -8,
                height: lineHeight ? lineHeight - 2 : 0,
                transition: 'height 500ms cubic-bezier(0.23,1,0.32,1)',
              }}
            />

            <div ref={traceRef} className="flex flex-col gap-1 py-1">
              {PHASES.map((phase, i) => {
                const config = PHASE_CONFIG[phase];
                const entry = stepFor(phase);
                const reached = entry !== undefined;
                const isCurrent = phase === currentPhase && !isDone;
                const relativeMs = entry ? entry.at - startedAt : null;
                const isLast = i === PHASES.length - 1;

                return (
                  <div
                    key={phase}
                    className="flex min-h-7 w-full items-center gap-2 rounded-control px-1.5 py-0.5"
                    style={{ animation: `fade-up 320ms cubic-bezier(0.23,1,0.32,1) ${i * 80}ms both` }}
                  >
                    {/* Status indicator */}
                    {isCurrent ? (
                      <span
                        className="size-3 shrink-0 rounded-full border-[1.5px] border-line-strong border-t-ink-2"
                        style={{ animation: 'spin 700ms linear infinite' }}
                      />
                    ) : reached ? (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--ink-3)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="shrink-0"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    ) : (
                      <span className="size-3 shrink-0 rounded-full border-[1.5px] border-line-strong opacity-30" />
                    )}

                    {/* Label */}
                    <span
                      className={`min-w-0 truncate text-[12.5px] font-medium ${
                        reached ? 'text-ink' : 'text-ink-3'
                      }`}
                    >
                      {config.label}
                    </span>

                    {/* Description */}
                    {reached && (
                      <span className="shrink-0 text-[11.5px] text-ink-3 truncate">
                        {config.describe(
                          entry?.sourceCount ?? sourceCount,
                          query,
                        )}
                      </span>
                    )}

                    {/* Relative timestamp */}
                    {relativeMs !== null && (
                      <span className="ml-auto shrink-0 font-mono text-[11.5px] text-ink-3 tabular-nums">
                        +{formatElapsed(relativeMs)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

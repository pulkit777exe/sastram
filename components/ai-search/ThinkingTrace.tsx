'use client';

import type { SSEPhase } from './PhaseTracker';
import { ThinkingState } from './ThinkingState';

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

export function ThinkingTrace(props: ThinkingTraceProps) {
  return <ThinkingState {...props} />;
}

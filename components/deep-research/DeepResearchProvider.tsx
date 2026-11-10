'use client';

import { createContext, use, useMemo, useState, useCallback } from 'react';
import type { ResearchPhase } from './ProgressRail';
import type { ActivityItem } from './ActivityFeed';
import type { EvidenceBoardItem } from './EvidenceBoard';
import type { CoverageItem } from './CoverageMap';
import type { Source, ResearchEvidence, ResearchGaps, ResearchPlan } from '@/modules/ai-search/types';

export interface DeepResearchState {
  query: string;
  isResearching: boolean;
  isComplete: boolean;
  error: string | null;
  phases: ResearchPhase[];
  activities: ActivityItem[];
  sources: Source[];
  evidence: ResearchEvidence[];
  evidenceItems: EvidenceBoardItem[];
  coverageItems: CoverageItem[];
  gaps?: ResearchGaps;
  plan?: ResearchPlan;
  totalElapsed: number;
  estimatedTotal?: number;
  currentPhaseId?: string;
}

export interface DeepResearchActions {
  setQuery: (query: string) => void;
  startResearch: (query?: string) => Promise<void> | void;
  stopResearch: () => void;
  reset: () => void;
  addActivity: (activity: ActivityItem) => void;
  updatePhase: (phaseId: string, updates: Partial<ResearchPhase>) => void;
  addSource: (source: Source) => void;
  addEvidence: (evidence: ResearchEvidence) => void;
}

export interface DeepResearchContextValue {
  state: DeepResearchState;
  actions: DeepResearchActions;
}

const DeepResearchContext = createContext<DeepResearchContextValue | null>(null);

interface DeepResearchProviderProps {
  children: React.ReactNode;
  initialQuery?: string;
  initialState?: Partial<DeepResearchState>;
}

export function DeepResearchProvider({
  children,
  initialQuery = '',
  initialState,
}: DeepResearchProviderProps) {
  const [query, setQuery] = useState(initialQuery);
  const [isResearching, setIsResearching] = useState(initialState?.isResearching ?? false);
  const [isComplete, setIsComplete] = useState(initialState?.isComplete ?? false);
  const [error, setError] = useState<string | null>(initialState?.error ?? null);
  const [phases, setPhases] = useState<ResearchPhase[]>(initialState?.phases ?? []);
  const [activities, setActivities] = useState<ActivityItem[]>(initialState?.activities ?? []);
  const [sources, setSources] = useState<Source[]>(initialState?.sources ?? []);
  const [evidence, setEvidence] = useState<ResearchEvidence[]>(initialState?.evidence ?? []);
  const [evidenceItems, setEvidenceItems] = useState<EvidenceBoardItem[]>(
    initialState?.evidenceItems ?? []
  );
  const [coverageItems, setCoverageItems] = useState<CoverageItem[]>(
    initialState?.coverageItems ?? []
  );
  const [gaps, setGaps] = useState<ResearchGaps | undefined>(initialState?.gaps);
  const [plan, setPlan] = useState<ResearchPlan | undefined>(initialState?.plan);
  const [totalElapsed, setTotalElapsed] = useState(initialState?.totalElapsed ?? 0);
  const [estimatedTotal, setEstimatedTotal] = useState(initialState?.estimatedTotal);

  const currentPhaseId = useMemo(
    () => phases.find((p) => p.status === 'active')?.id,
    [phases]
  );

  const startResearch = useCallback((q?: string) => {
    if (q !== undefined) setQuery(q);
    setIsResearching(true);
    setIsComplete(false);
    setError(null);
  }, []);

  const stopResearch = useCallback(() => {
    setIsResearching(false);
  }, []);

  const reset = useCallback(() => {
    setQuery(initialQuery);
    setIsResearching(false);
    setIsComplete(false);
    setError(null);
    setPhases(initialState?.phases ?? []);
    setActivities(initialState?.activities ?? []);
    setSources(initialState?.sources ?? []);
    setEvidence(initialState?.evidence ?? []);
    setEvidenceItems(initialState?.evidenceItems ?? []);
    setCoverageItems(initialState?.coverageItems ?? []);
    setGaps(initialState?.gaps);
    setPlan(initialState?.plan);
    setTotalElapsed(initialState?.totalElapsed ?? 0);
    setEstimatedTotal(initialState?.estimatedTotal);
  }, [initialQuery, initialState]);

  const addActivity = useCallback((activity: ActivityItem) => {
    setActivities((prev) => [activity, ...prev]);
  }, []);

  const updatePhase = useCallback((phaseId: string, updates: Partial<ResearchPhase>) => {
    setPhases((prev) =>
      prev.map((phase) => (phase.id === phaseId ? { ...phase, ...updates } : phase))
    );
  }, []);

  const addSource = useCallback((source: Source) => {
    setSources((prev) => {
      if (prev.find((s) => s.id === source.id)) return prev;
      return [...prev, source];
    });
  }, []);

  const addEvidence = useCallback((ev: ResearchEvidence) => {
    setEvidence((prev) => {
      if (prev.find((e) => e.id === ev.id)) return prev;
      return [...prev, ev];
    });
  }, []);

  const value = useMemo<DeepResearchContextValue>(
    () => ({
      state: {
        query,
        isResearching,
        isComplete,
        error,
        phases,
        activities,
        sources,
        evidence,
        evidenceItems,
        coverageItems,
        gaps,
        plan,
        totalElapsed,
        estimatedTotal,
        currentPhaseId,
      },
      actions: {
        setQuery,
        startResearch,
        stopResearch,
        reset,
        addActivity,
        updatePhase,
        addSource,
        addEvidence,
      },
    }),
    [
      query,
      isResearching,
      isComplete,
      error,
      phases,
      activities,
      sources,
      evidence,
      evidenceItems,
      coverageItems,
      gaps,
      plan,
      totalElapsed,
      estimatedTotal,
      currentPhaseId,
      setQuery,
      startResearch,
      stopResearch,
      reset,
      addActivity,
      updatePhase,
      addSource,
      addEvidence,
    ]
  );

  return <DeepResearchContext.Provider value={value}>{children}</DeepResearchContext.Provider>;
}

export function useDeepResearch(): DeepResearchContextValue {
  const ctx = use(DeepResearchContext);
  if (!ctx) throw new Error('useDeepResearch must be used within DeepResearchProvider');
  return ctx;
}

// Alias exports for flexibility
export { DeepResearchProvider as Provider };
export { useDeepResearch as useResearch };
export type { DeepResearchContextValue as ResearchContextValue };

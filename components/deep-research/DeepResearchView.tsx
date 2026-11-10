'use client';

import { cn } from '@/lib/utils/cn';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressRail } from './ProgressRail';
import { ActivityFeed } from './ActivityFeed';
import { EvidenceBoard } from './EvidenceBoard';
import { CoverageMap } from './CoverageMap';
import { useDeepResearch } from './DeepResearchProvider';
import { Search } from 'lucide-react';

interface DeepResearchViewProps {
  className?: string;
  showProgressRail?: boolean;
  showActivityFeed?: boolean;
  showEvidenceBoard?: boolean;
  showCoverageMap?: boolean;
  layout?: 'default' | 'focused' | 'compact';
}

export function DeepResearchView({
  className,
  showProgressRail = true,
  showActivityFeed = true,
  showEvidenceBoard = true,
  showCoverageMap = true,
  layout = 'default',
}: DeepResearchViewProps) {
  const { state } = useDeepResearch();

  if (layout === 'compact') {
    return (
      <div className={cn('w-full space-y-4', className)}>
        {showProgressRail && state.phases.length > 0 ? (
          <ProgressRail
            phases={state.phases}
            totalElapsed={state.totalElapsed}
            estimatedTotal={state.estimatedTotal}
          />
        ) : null}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {showActivityFeed ? <ActivityFeed activities={state.activities} /> : null}
          {showEvidenceBoard ? (
            <EvidenceBoard
              sources={state.sources}
              evidence={state.evidence}
              items={state.evidenceItems}
            />
          ) : null}
        </div>
      </div>
    );
  }

  if (layout === 'focused') {
    return (
      <div className={cn('w-full max-w-4xl mx-auto space-y-4', className)}>
        {state.query ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="h-4 w-4 text-brand" />
                Research Query
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-ink">{state.query}</p>
            </CardContent>
          </Card>
        ) : null}
        {showProgressRail && state.phases.length > 0 ? (
          <ProgressRail
            phases={state.phases}
            totalElapsed={state.totalElapsed}
            estimatedTotal={state.estimatedTotal}
          />
        ) : null}
        {showActivityFeed ? <ActivityFeed activities={state.activities} /> : null}
        {showEvidenceBoard ? (
          <EvidenceBoard
            sources={state.sources}
            evidence={state.evidence}
            items={state.evidenceItems}
          />
        ) : null}
        {showCoverageMap ? <CoverageMap items={state.coverageItems} gaps={state.gaps} /> : null}
      </div>
    );
  }

  // default layout
  return (
    <div className={cn('w-full space-y-4', className)}>
      {state.query ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4 text-brand" />
              Research Query
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-ink">{state.query}</p>
          </CardContent>
        </Card>
      ) : null}
      {showProgressRail && state.phases.length > 0 ? (
        <ProgressRail
          phases={state.phases}
          totalElapsed={state.totalElapsed}
          estimatedTotal={state.estimatedTotal}
        />
      ) : null}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-6 space-y-4">
          {showActivityFeed ? <ActivityFeed activities={state.activities} /> : null}
        </div>
        <div className="xl:col-span-6 space-y-4">
          {showEvidenceBoard ? (
            <EvidenceBoard
              sources={state.sources}
              evidence={state.evidence}
              items={state.evidenceItems}
            />
          ) : null}
          {showCoverageMap ? <CoverageMap items={state.coverageItems} gaps={state.gaps} /> : null}
        </div>
      </div>
    </div>
  );
}

// Compound component pattern
DeepResearchView.ProgressRail = ProgressRail;
DeepResearchView.ActivityFeed = ActivityFeed;
DeepResearchView.EvidenceBoard = EvidenceBoard;
DeepResearchView.CoverageMap = CoverageMap;
export default DeepResearchView;

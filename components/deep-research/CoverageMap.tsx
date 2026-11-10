'use client';

import { Map, CheckCircle2, AlertCircle, Circle, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import type { ResearchGaps } from '@/modules/ai-search/types';

export type CoverageStatus = 'covered' | 'partial' | 'gap' | 'unknown';

export interface CoverageItem {
  id: string;
  topic: string;
  status: CoverageStatus;
  confidence?: number;
  sources?: number;
  description?: string;
}

interface CoverageMapProps {
  items?: CoverageItem[];
  gaps?: ResearchGaps | string[];
  suggestions?: string[];
  className?: string;
}

const statusConfig = {
  covered: {
    icon: CheckCircle2,
    label: 'Covered',
    className: 'text-emerald-500',
    bgClassName: 'bg-emerald-500/10',
  },
  partial: {
    icon: Circle,
    label: 'Partial',
    className: 'text-amber-500',
    bgClassName: 'bg-amber-500/10',
  },
  gap: {
    icon: AlertCircle,
    label: 'Gap',
    className: 'text-red-500',
    bgClassName: 'bg-red-500/10',
  },
  unknown: {
    icon: Circle,
    label: 'Unknown',
    className: 'text-ink-3',
    bgClassName: 'bg-surface-2',
  },
};

export function CoverageMap({ items, gaps, suggestions, className }: CoverageMapProps) {
  const normalizedItems: CoverageItem[] = items || [];

  // Normalize gaps from ResearchGaps type
  if (gaps) {
    if (Array.isArray(gaps)) {
      for (const gap of gaps) {
        if (!normalizedItems.find((i) => i.topic === gap)) {
          normalizedItems.push({
            id: `gap-${gap}`,
            topic: gap,
            status: 'gap',
          });
        }
      }
    } else if ('gaps' in gaps && Array.isArray(gaps.gaps)) {
      for (const gap of gaps.gaps) {
        if (!normalizedItems.find((i) => i.topic === gap)) {
          normalizedItems.push({
            id: `gap-${gap}`,
            topic: gap,
            status: 'gap',
            description: gaps.suggestions?.find((s) => s.toLowerCase().includes(gap.toLowerCase())),
          });
        }
      }
      if (gaps.suggestions && !suggestions) {
        suggestions = gaps.suggestions;
      }
    }
  }

  const covered = normalizedItems.filter((i) => i.status === 'covered').length;
  const partial = normalizedItems.filter((i) => i.status === 'partial').length;
  const gapCount = normalizedItems.filter((i) => i.status === 'gap').length;
  const total = normalizedItems.length;

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Map className="h-4 w-4 text-brand" />
            Coverage
          </CardTitle>
          {total > 0 ? (
            <div className="flex items-center gap-2 text-xs text-ink-3">
              <span className="text-emerald-500">{covered}</span>/
              <span className="text-amber-500">{partial}</span>/
              <span className="text-red-500">{gapCount}</span>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {normalizedItems.length === 0 ? (
          <p className="text-sm text-ink-3 text-center py-4">No coverage data yet</p>
        ) : (
          <div className="space-y-1.5">
            {normalizedItems.map((item) => {
              const config = statusConfig[item.status];
              const StatusIcon = config.icon;

              return (
                <div
                  key={item.id}
                  className="flex items-start gap-2.5 p-2 rounded-card border border-line/60"
                >
                  <div
                    className={cn(
                      'h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                      config.bgClassName
                    )}
                  >
                    <StatusIcon className={cn('h-3.5 w-3.5', config.className)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-ink">{item.topic}</p>
                      <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4', config.className)}>
                        {config.label}
                      </Badge>
                    </div>
                    {item.description ? (
                      <p className="text-xs text-ink-3 mt-0.5">{item.description}</p>
                    ) : null}
                    {item.sources !== undefined ? (
                      <p className="text-xs text-ink-3 mt-0.5">{item.sources} source(s)</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {suggestions && suggestions.length > 0 ? (
          <div className="pt-2 border-t border-line/40">
            <p className="text-xs font-medium text-ink-2 mb-1.5">Suggestions</p>
            <div className="space-y-1">
              {suggestions.map((suggestion, idx) => (
                <div key={idx} className="flex items-start gap-1.5 text-xs text-ink-3">
                  <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-brand" />
                  <span>{suggestion}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

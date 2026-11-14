'use client';

import { useMemo, useState } from 'react';
import { Sparkles, AlertTriangle, MessageSquarePlus, GitFork } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ConflictInfo, Citation, Source, ResearchEvidence } from '@/modules/ai-search/types';
import { orderSourcesByCitation } from '@/modules/ai-search/citations';
import { StreamingText, type RetryStyle, type FeedbackType } from './StreamingText';
import { CollectionSaveButton } from '@/components/collections/CollectionSaveButton';
import { Button } from '@/components/ui/button';
import { toasts } from '@/lib/utils/toast';
import { createThreadAction } from '@/modules/threads/actions';
import { renderCitationSources } from '@/modules/ai-search/citation-sources';
import { createVerificationThreadAction } from '@/modules/threads/actions';

interface SynthesisCardProps {
  text: string;
  citations?: Citation[];
  sources?: Source[];
  conflictData?: ConflictInfo | null;
  sourceCount: number;
  queryType: 'factual' | 'opinion' | 'technical' | 'comparison';
  query?: string;
  sessionId?: string;
  evidence?: ResearchEvidence[];
  onCiteClick?: (sourceId: string) => void;
  isStreaming?: boolean;
  fromHistory?: boolean;
  onRetry?: (style: RetryStyle) => void;
  onFeedback?: (type: FeedbackType, reason?: string) => void;
}

const QUERY_TYPE_LABELS: Record<string, { label: string; variant: 'live' | 'warning' | 'success' | 'secondary' }> = {
  factual: { label: 'Factual', variant: 'live' },
  opinion: { label: 'Opinion', variant: 'warning' },
  technical: { label: 'Technical', variant: 'success' },
  comparison: { label: 'Comparison', variant: 'secondary' },
};

export function SynthesisCard({
  text,
  citations = [],
  sources = [],
  conflictData,
  sourceCount,
  queryType,
  query,
  sessionId,
  evidence = [],
  onCiteClick,
  isStreaming = false,
  fromHistory = false,
  onRetry,
  onFeedback,
}: SynthesisCardProps) {
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const typeConfig = QUERY_TYPE_LABELS[queryType] || QUERY_TYPE_LABELS.technical;

  const orderedSources = useMemo(() => orderSourcesByCitation(sources, citations), [sources, citations]);
  const canCreateVerificationThread = !isStreaming && Boolean(sessionId) && evidence.length > 0;

  const saveMetadata = useMemo(
    () => ({ type: 'ai_synthesis', text, queryType, sourceCount, sources: orderedSources.slice(0, 3), citations }),
    [text, queryType, sourceCount, orderedSources, citations]
  );


  async function forkIntoThread(mode: 'fork' | 'verify') {
    if (!text) return;
    setActionBusy(mode);
    try {
      const q = (query || 'AI search result').slice(0, 100);
      if (mode === 'verify' && canCreateVerificationThread && sessionId) {
        const title = `Verify: ${q}`.slice(0, 120);
        const res = await createVerificationThreadAction({ sessionId, title });
        if (res?.ok && res.data?.slug) {
          toasts.success('Verification thread created');
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- navigate after server action create
          window.location.href = `/dashboard/threads/${res.data.slug}`;
        } else {
          toasts.error(res?.error || 'Failed to create verification thread');
        }
        return;
      }

      const title = mode === 'verify' ? `Verify: ${q}`.slice(0, 120) : `Discussion: ${q}`.slice(0, 120);
      const citeLines = renderCitationSources(citations, orderedSources as Parameters<typeof renderCitationSources>[1]).slice(0, 8).join('\n');
      const body = [
        query ? `**Question:** ${query}` : '',
        mode === 'verify' ? '**Ask:** Can the community verify this AI-synthesized answer and add missing evidence/corrections?' : '**Context:** Forked from an AI multi-source synthesis for discussion.',
        '',
        text,
        citeLines ? `\n**Sources**\n${citeLines}` : '',
      ].filter(Boolean).join('\n\n').slice(0, 9000);
      const res = await createThreadAction({ title, description: `From Sai multi-source search (${queryType})`, initialMessage: body });
      if (res?.ok && res.data?.slug) {
        toasts.success(mode === 'verify' ? 'Verification thread created' : 'Thread created from answer');
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- navigate after server action create
        window.location.href = `/dashboard/threads/${res.data.slug}`;
      } else {
        toasts.error(res?.error || 'Failed to create thread');
      }
    } catch {
      toasts.error(mode === 'verify' ? 'Failed to create verification thread' : 'Failed to create thread');
    } finally {
      setActionBusy(null);
    }
  }

  if (!text) {
    return (
      <div className="bg-surface border border-line rounded-card p-5 text-center text-sm text-ink-2 shadow-card">
        No synthesis available.
      </div>
    );
  }

  return (
    <div className="relative bg-surface border border-line rounded-card shadow-card overflow-hidden">
      {/* Top shimmering loader line when streaming */}
      <div className="h-0.5 w-full bg-linear-to-r from-transparent via-line-strong to-transparent">
        {isStreaming && (
          <div
            className="h-full w-1/3 bg-linear-to-r from-transparent via-ink-2 to-transparent"
            style={{
              backgroundSize: '200% 100%',
              animation: 'shimmer-text 1.4s linear infinite',
            }}
          />
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-ink" />
          <span className="text-[13px] font-semibold text-ink">Sai Synthesis</span>
          <span className="text-[12px] text-ink-3">
            · {sourceCount} source{sourceCount !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <CollectionSaveButton metadata={saveMetadata} label="Save" />
          <Badge variant={typeConfig.variant} className="px-2 py-0.5 text-[11px] font-medium rounded-full">
            {typeConfig.label}
          </Badge>
        </div>
      </div>

      {/* Content wrapper */}
      <div className="px-5 pb-5">
        <StreamingText
          text={text}
          sources={orderedSources}
          citations={citations}
          onCiteClick={onCiteClick}
          isStreaming={isStreaming}
          fromHistory={fromHistory}
          onDone={() => {}}
          onRetry={onRetry}
          onFeedback={onFeedback}
        />
      </div>

      {/* Answer actions */}
      {!isStreaming && text && (
        <div className="px-5 pb-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3 mr-1">Actions</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 rounded-full text-xs"
            onClick={() => forkIntoThread('verify')}
            disabled={actionBusy !== null}
          >
            <MessageSquarePlus size={12} /> {actionBusy === 'verify' ? 'Creating…' : 'Ask community to verify'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 rounded-full text-xs"
            onClick={() => forkIntoThread('fork')}
            disabled={actionBusy !== null}
          >
            <GitFork size={12} /> {actionBusy === 'fork' ? 'Creating…' : 'Fork into thread'}
          </Button>
          <CollectionSaveButton metadata={saveMetadata} label="Save to collection" />
        </div>
      )}

      {/* Conflict Warning */}
      {conflictData?.detected && (
        <div className="mx-5 mb-5 px-4 py-3 bg-red-tint border border-line rounded-card animate-fade-up">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={15} className="text-red mt-0.5 shrink-0" />
            <div className="text-[12.5px] leading-relaxed">
              <p className="font-semibold text-red mb-0.5">Conflict Detected</p>
              <p className="text-ink-2 mb-1.5">{conflictData.description}</p>
              {conflictData.sideA && (
                <p className="text-ink font-medium">
                  <span className="text-ink-3 font-normal">Side A:</span> {conflictData.sideA}
                </p>
              )}
              {conflictData.sideB && (
                <p className="text-ink font-medium">
                  <span className="text-ink-3 font-normal">Side B:</span> {conflictData.sideB}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { forwardRef, useEffect, useState } from 'react';
import { ExternalLink, AlertTriangle, Shield, Star, Globe, MessageCircle } from 'lucide-react';
import { TimeAgo } from '@/components/ui/TimeAgo';
import { Badge } from '@/components/ui/badge';

interface SourceCardProps {
  id: string;
  title: string;
  url: string;
  source: string;
  snippet: string;
  confidence: number;
  tier: 1 | 2 | 3 | 4;
  publishedDate?: string;
  isOutdated?: boolean;
  provider: 'exa' | 'tavily';
  index: number;
  highlighted?: boolean;
  onSelect?: (id: string) => void;
  isLowerQuality?: boolean;
}

const TIER_CONFIG = {
  1: {
    label: 'Official',
    variant: 'success' as const,
    icon: Shield,
  },
  2: {
    label: 'Trusted',
    variant: 'live' as const,
    icon: Star,
  },
  3: {
    label: 'Community',
    variant: 'secondary' as const,
    icon: MessageCircle,
  },
  4: {
    label: 'Blog',
    variant: 'outline' as const,
    icon: Globe,
  },
};

export const SourceCard = forwardRef<HTMLDivElement, SourceCardProps>(function SourceCard(
  {
    id,
    title,
    url,
    source,
    snippet,
    tier,
    publishedDate,
    isOutdated,
    provider,
    index,
    highlighted = false,
    onSelect,
    isLowerQuality = false,
  },
  ref
) {
  const [isVisible, setIsVisible] = useState(false);

  const tierConfig = TIER_CONFIG[tier];

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), index * 60);
    return () => clearTimeout(timer);
  }, [index]);

  return (
    <div
      ref={ref}
      id={`source-${id}`}
      onClick={() => onSelect?.(id)}
      className={`bg-surface border border-line rounded-xl p-4 transition-all duration-500 ease-out hover:border-line-strong group scroll-mt-4 cursor-pointer ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
      } ${highlighted ? 'ring-2 ring-sai-accent/40 border-sai-accent/40' : ''} ${
        isLowerQuality ? 'border-sai-orange/30 bg-sai-orange/5 hover:border-sai-orange/50' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-sm font-medium text-ink hover:underline inline-flex items-center gap-1 group/link"
          >
            <span className="truncate">{title}</span>
            <ExternalLink
              size={12}
              className="shrink-0 opacity-0 group-hover/link:opacity-100 transition-opacity"
            />
          </a>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-ink-2 truncate">{source}</span>
            {publishedDate && (
              <span className="text-xs text-ink-3">
                · <TimeAgo date={publishedDate} />
              </span>
            )}
            <span className="text-xs text-ink-3/40">via {provider}</span>
          </div>
        </div>

        {/* Tier badge — readable trust signal */}
        <Badge variant={tierConfig.variant} className="px-2 py-0.5 text-xs shrink-0">
          {tierConfig.label}
        </Badge>
      </div>

      {/* Snippet */}
      <p className="text-xs text-ink-2 leading-relaxed line-clamp-3 mb-3">{snippet}</p>

      {/* Outdated warning */}
      {isOutdated && (
        <div className="flex items-center gap-1.5 text-xs text-sai-orange">
          <AlertTriangle size={10} />
          <span>
            Content from {publishedDate ? <TimeAgo date={publishedDate} /> : 'unknown date'} — may
            be outdated
          </span>
        </div>
      )}
    </div>
  );
});

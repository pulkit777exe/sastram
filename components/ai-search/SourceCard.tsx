'use client';

import { forwardRef, useEffect, useState } from 'react';
import { ExternalLink, AlertTriangle, Shield, Star, Globe, MessageCircle } from 'lucide-react';
import { TimeAgo } from '@/components/ui/TimeAgo';

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
    badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    icon: Shield,
  },
  2: {
    label: 'Trusted',
    badge: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    icon: Star,
  },
  3: {
    label: 'Community',
    badge: 'bg-foreground/10 text-muted-foreground',
    icon: MessageCircle,
  },
  4: {
    label: 'Blog',
    badge: 'bg-foreground/5 text-muted-foreground/60',
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
      className={`bg-card border border-border rounded-xl p-4 transition-all duration-500 ease-out hover:border-foreground/20 hover:shadow-linear-sm group scroll-mt-4 cursor-pointer ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
      } ${highlighted ? 'ring-2 ring-foreground/40 border-foreground/40' : ''} ${
        isLowerQuality ? 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50' : ''
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
            className="text-sm font-medium text-foreground hover:underline inline-flex items-center gap-1 group/link"
          >
            <span className="truncate">{title}</span>
            <ExternalLink
              size={12}
              className="shrink-0 opacity-0 group-hover/link:opacity-100 transition-opacity"
            />
          </a>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] text-muted-foreground truncate">{source}</span>
            {publishedDate && (
              <span className="text-[10px] text-muted-foreground/70">
                · <TimeAgo date={publishedDate} />
              </span>
            )}
            <span className="text-[10px] text-muted-foreground/40">via {provider}</span>
          </div>
        </div>

        {/* Tier badge — readable trust signal */}
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${tierConfig.badge}`}
        >
          {tierConfig.label}
        </span>
      </div>

      {/* Snippet */}
      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 mb-3">{snippet}</p>

      {/* Outdated warning */}
      {isOutdated && (
        <div className="flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400">
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

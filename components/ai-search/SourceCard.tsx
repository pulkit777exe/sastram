'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, AlertTriangle, Shield, Star, Globe, MessageCircle } from 'lucide-react';
import { TimeAgo } from '@/components/ui/TimeAgo';

interface SourceCardProps {
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
}

const TIER_CONFIG = {
  1: {
    label: 'T1',
    color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    icon: Shield,
    desc: 'Official',
  },
  2: {
    label: 'T2',
    color: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    icon: Star,
    desc: 'Trusted',
  },
  3: {
    label: 'T3',
    color: 'bg-foreground/10 text-muted-foreground',
    icon: MessageCircle,
    desc: 'Community',
  },
  4: {
    label: 'T4',
    color: 'bg-foreground/5 text-muted-foreground/60',
    icon: Globe,
    desc: 'Blog',
  },
};

export function SourceCard({
  title,
  url,
  source,
  snippet,
  confidence,
  tier,
  publishedDate,
  isOutdated,
  provider,
  index,
}: SourceCardProps) {
  const [animatedConfidence, setAnimatedConfidence] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  const tierConfig = TIER_CONFIG[tier];

  // Stagger entrance
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), index * 100);
    return () => clearTimeout(timer);
  }, [index]);

  // Animate confidence bar
  useEffect(() => {
    if (!isVisible) return;
    const timer = setTimeout(() => setAnimatedConfidence(confidence), 100);
    return () => clearTimeout(timer);
  }, [isVisible, confidence]);

  return (
    <div
      className={`bg-card border border-border rounded-xl p-4 transition-all duration-500 ease-out hover:border-foreground/20 hover:shadow-sm group ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
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

        {/* Tier badge */}
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${tierConfig.color}`}
          title={tierConfig.desc}
        >
          {tierConfig.label}
        </span>
      </div>

      {/* Snippet */}
      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 mb-3">{snippet}</p>

      {/* Outdated warning */}
      {isOutdated && (
        <div className="flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400 mb-2">
          <AlertTriangle size={10} />
          <span>
            Content from {publishedDate ? <TimeAgo date={publishedDate} /> : 'unknown date'} — may
            be outdated
          </span>
        </div>
      )}

      {/* Confidence bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-600 ease-out"
            style={{
              width: `${animatedConfidence}%`,
              backgroundColor:
                confidence > 70
                  ? 'var(--color-foreground)'
                  : confidence > 40
                    ? 'hsl(35, 90%, 55%)'
                    : 'hsl(0, 70%, 55%)',
            }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground font-medium tabular-nums">
          {confidence}%
        </span>
      </div>
    </div>
  );
}

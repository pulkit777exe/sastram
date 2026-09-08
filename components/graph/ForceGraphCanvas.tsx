'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

type GraphNode = { id: string; name: string; slug: string };
type GraphLink = { source: string; target: string; similarity: number; id: string };

export function ForceGraphCanvas({
  nodes,
  links,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let instance: { _destructor?: () => void } | null = null;
    let cancelled = false;

    async function mount() {
      if (!containerRef.current || nodes.length === 0) return;
      try {
        const mod = await import('force-graph');
        if (cancelled || !containerRef.current) return;
        const ForceGraph = (mod as unknown as { default: () => (el: HTMLElement) => unknown }).default;
        const el = containerRef.current;
        const width = el.clientWidth;
        const height = Math.min(520, Math.max(320, window.innerHeight * 0.55));
        el.style.height = `${height}px`;

        const fg = (ForceGraph() as unknown as (el: HTMLElement) => {
          graphData: (d: unknown) => unknown;
          width: (w: number) => unknown;
          height: (h: number) => unknown;
          nodeLabel: (fn: (n: unknown) => string) => unknown;
          nodeColor: (fn: (n: unknown) => string) => unknown;
          nodeRelSize: (n: number) => unknown;
          linkColor: (fn: (l: unknown) => string) => unknown;
          linkWidth: (fn: (l: unknown) => number) => unknown;
          linkDirectionalArrowLength: (n: number) => unknown;
          onNodeClick: (fn: (n: unknown) => void) => unknown;
          d3Force: (name: string, force: unknown) => unknown;
        })(el);

        const graphNodes = nodes.map((n) => ({ id: n.id, name: n.name, slug: n.slug }));
        const graphLinks = links.map((l) => ({
          source: l.source,
          target: l.target,
          similarity: l.similarity,
          id: l.id,
        }));

        fg.graphData({ nodes: graphNodes, links: graphLinks });
        fg.width(width);
        fg.height(height);
        fg.nodeLabel((n: unknown) => (n as GraphNode).name);
        fg.nodeColor((n: unknown) => {
          const id = (n as GraphNode).id;
          const incident = links.filter((l) => l.source === id || l.target === id);
          const maxSim = incident.length ? Math.max(...incident.map((l) => l.similarity)) : 0;
          return maxSim >= 0.85 ? '#10b981' : '#f59e0b';
        });
        fg.nodeRelSize(6);
        fg.linkColor((l: unknown) => {
          const sim = (l as { similarity: number }).similarity;
          return sim >= 0.85 ? 'rgba(16,185,129,0.9)' : 'rgba(245,158,11,0.8)';
        });
        fg.linkWidth((l: unknown) => {
          const sim = (l as { similarity: number }).similarity;
          return sim >= 0.85 ? 2.2 : 1.2;
        });
        fg.linkDirectionalArrowLength(3.5);
        fg.onNodeClick((n: unknown) => {
          const slug = (n as GraphNode).slug;
          if (slug) window.location.href = `/dashboard/threads/${slug}`;
        });

        try {
          const d3ForceLink = fg.d3Force('link', null);
          void d3ForceLink;
        } catch {
          // ignore if d3Force not available in this version
        }

        const handleResize = () => {
          if (!el || cancelled) return;
          try {
            fg.width(el.clientWidth);
          } catch {
            // ignore
          }
        };
        window.addEventListener('resize', handleResize);
        instance = {
          _destructor: () => {
            window.removeEventListener('resize', handleResize);
            try {
              el.innerHTML = '';
            } catch {
              // ignore
            }
          },
        };
      } catch (e) {
        setRenderError(e instanceof Error ? e.message : String(e));
      }
    }

    mount();
    return () => {
      cancelled = true;
      try {
        instance?._destructor?.();
      } catch {
        // ignore
      }
    };
  }, [nodes, links]);

  if (renderError) {
    return (
      <div className="rounded-card border border-line bg-surface p-4">
        <p className="text-sm text-ink-2">Graph failed to load, showing list instead.</p>
        <p className="text-xs text-ink-3 mt-1 font-mono break-all">{renderError}</p>
        <div className="grid gap-3 sm:grid-cols-2 mt-4">
          {links.map((r) => {
            const pct = Math.round(r.similarity * 100);
            const isHigh = pct >= 85;
            const source = nodes.find((n) => n.id === r.source);
            const target = nodes.find((n) => n.id === r.target);
            return (
              <Link
                key={r.id}
                href={`/dashboard/threads/${target?.slug ?? ''}`}
                className="group flex flex-col gap-2 rounded-card border border-line bg-surface p-4 hover:bg-hover hover:border-line-strong transition-colors shadow-card"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[10px] font-medium ${isHigh ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700' : 'bg-amber-500/10 border-amber-500/20 text-amber-700'}`}
                  >
                    {pct}%
                  </span>
                  <span className="h-1 flex-1 rounded-full bg-field overflow-hidden">
                    <span className={`block h-full ${isHigh ? 'bg-sai-green' : 'bg-sai-orange'}`} style={{ width: `${pct}%` }} />
                  </span>
                  <ArrowRight size={12} className="text-ink-3 group-hover:text-ink" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-ink leading-snug line-clamp-2">{source?.name ?? r.source}</p>
                  <p className="text-xs text-ink-3">related to</p>
                  <p className="text-sm font-medium text-ink-2 leading-snug line-clamp-2 group-hover:text-ink">{target?.name ?? r.target}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-line bg-surface shadow-card overflow-hidden">
      <div ref={containerRef} className="w-full bg-canvas" style={{ minHeight: 360 }} />
      <div className="flex items-center justify-between px-3 py-2 border-t border-line bg-surface text-xs text-ink-3">
        <span>Drag to pan · scroll to zoom · click node to open thread</span>
        <span className="hidden sm:inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-500" /> 85%+</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-500" /> 70-85%</span>
        </span>
      </div>
    </div>
  );
}

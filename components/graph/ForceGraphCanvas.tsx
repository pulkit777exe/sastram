'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Search, Maximize2, ZoomIn, ZoomOut, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type GraphNode = { id: string; name: string; slug: string };
type GraphLink = { source: string; target: string; similarity: number; id: string };

export function ForceGraphCanvas({
  nodes,
  links,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
}) {
  const router = useRouter();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const fgRef = React.useRef<unknown>(null);
  const [renderError, setRenderError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [hover, setHover] = React.useState<GraphNode | null>(null);

  const degree = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const l of links) {
      m.set(l.source, (m.get(l.source) ?? 0) + 1);
      m.set(l.target, (m.get(l.target) ?? 0) + 1);
    }
    return m;
  }, [links]);

  const filteredIds = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return new Set(nodes.filter((n) => n.name.toLowerCase().includes(q)).map((n) => n.id));
  }, [search, nodes]);

  // Refs to avoid remounting force-graph on hover/search changes — painter reads latest via refs (KISS)
  const degreeRef = React.useRef(degree);
  const filteredIdsRef = React.useRef(filteredIds);
  const hoverRef = React.useRef(hover);
  const linksRef = React.useRef(links);
  React.useEffect(() => { degreeRef.current = degree; }, [degree]);
  React.useEffect(() => { filteredIdsRef.current = filteredIds; }, [filteredIds]);
  React.useEffect(() => { hoverRef.current = hover; }, [hover]);
  React.useEffect(() => { linksRef.current = links; }, [links]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    let instance: { _destructor?: () => void } | null = null;
    let cancelled = false;
    let zoomTimeout: ReturnType<typeof setTimeout> | null = null;

    async function mount() {
      if (!containerRef.current || nodes.length === 0) return;
      try {
        const mod = await import('force-graph');
        if (cancelled || !containerRef.current) return;
        const ForceGraph = (mod as unknown as { default: () => (el: HTMLElement) => unknown }).default;
        const el = containerRef.current;
        const width = el.clientWidth;
        const height = Math.min(560, Math.max(360, window.innerHeight * 0.58));
        el.style.height = `${height}px`;

        const fg = (ForceGraph() as unknown as (el: HTMLElement) => {
          graphData: (d: unknown) => unknown;
          width: (w: number) => unknown;
          height: (h: number) => unknown;
          nodeCanvasObject: (fn: (node: unknown, ctx: CanvasRenderingContext2D, scale: number) => void) => unknown;
          nodePointerAreaPaint: (fn: (node: unknown, color: string, ctx: CanvasRenderingContext2D) => void) => unknown;
          linkColor: (fn: (l: unknown) => string) => unknown;
          linkWidth: (fn: (l: unknown) => number) => unknown;
          linkDirectionalArrowLength: (n: number) => unknown;
          linkDirectionalArrowRelPos: (n: number) => unknown;
          onNodeClick: (fn: (n: unknown) => void) => unknown;
          onNodeHover: (fn: (n: unknown | null) => void) => unknown;
          d3Force: (name: string, force: unknown) => unknown;
          zoomToFit: (ms?: number, pad?: number) => unknown;
          zoom: (k: number, ms?: number) => unknown;
        })(el);
        fgRef.current = fg;

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

        fg.nodeCanvasObject((node: unknown, ctx: CanvasRenderingContext2D, scale: number) => {
          const n = node as GraphNode & { x?: number; y?: number };
          const x = n.x ?? 0;
          const y = n.y ?? 0;
          const deg = degreeRef.current.get(n.id) ?? 1;
          const r = Math.max(5, Math.min(11, 4 + deg * 1.2));
          const curFiltered = filteredIdsRef.current;
          const isFiltered = curFiltered ? !curFiltered.has(n.id) : false;
          const isHover = hoverRef.current?.id === n.id;
          const curLinks = linksRef.current;
          const maxSim = curLinks.filter((l) => l.source === n.id || l.target === n.id).reduce((acc, cur) => Math.max(acc, cur.similarity), 0);
          const base = maxSim >= 0.85 ? '#10b981' : maxSim >= 0.7 ? '#f59e0b' : '#94a3b8';
          const fill = isFiltered ? '#cbd5e1' : base;
          ctx.globalAlpha = isFiltered ? 0.35 : 1;
          ctx.beginPath();
          ctx.arc(x, y, r + (isHover ? 3 : 1.5), 0, 2 * Math.PI, false);
          ctx.fillStyle = isHover ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.75)';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x, y, r, 0, 2 * Math.PI, false);
          ctx.fillStyle = fill;
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          if (isHover || scale > 1.6) {
            const label = n.name.length > 22 ? n.name.slice(0, 21) + '…' : n.name;
            ctx.font = `${Math.max(9, 11 / scale)}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const pad = 4;
            const tw = ctx.measureText(label).width;
            const bx = x - tw / 2 - pad;
            const by = y + r + 6;
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.beginPath();
            // roundRect fallback for older canvas
            if (typeof (ctx as unknown as { roundRect?: unknown }).roundRect === 'function') {
              (ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(bx, by, tw + pad * 2, 14, 6);
            } else {
              ctx.rect(bx, by, tw + pad * 2, 14);
            }
            ctx.fill();
            ctx.strokeStyle = 'rgba(203,213,225,0.9)';
            ctx.lineWidth = 0.8;
            ctx.stroke();
            ctx.fillStyle = '#0f172a';
            ctx.fillText(label, x, by + 3);
          }
          ctx.globalAlpha = 1;
        });

        fg.nodePointerAreaPaint((node: unknown, color: string, ctx: CanvasRenderingContext2D) => {
          const n = node as GraphNode & { x?: number; y?: number };
          const deg = degreeRef.current.get(n.id) ?? 1;
          const r = Math.max(5, Math.min(11, 4 + deg * 1.2)) + 4;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, 2 * Math.PI, false);
          ctx.fill();
        });

        fg.linkColor((l: unknown) => {
          const sim = (l as GraphLink).similarity;
          const curFiltered = filteredIdsRef.current;
          const isDim = curFiltered ? !curFiltered.has((l as GraphLink).source as unknown as string) && !curFiltered.has((l as GraphLink).target as unknown as string) : false;
          if (isDim) return 'rgba(203,213,225,0.35)';
          return sim >= 0.85 ? 'rgba(16,185,129,0.85)' : sim >= 0.7 ? 'rgba(245,158,11,0.7)' : 'rgba(148,163,184,0.5)';
        });
        fg.linkWidth((l: unknown) => {
          const sim = (l as GraphLink).similarity;
          return sim >= 0.85 ? 2.4 : sim >= 0.7 ? 1.6 : 1;
        });
        fg.linkDirectionalArrowLength(4);
        fg.linkDirectionalArrowRelPos(1);

        fg.onNodeClick((n: unknown) => {
          const slug = (n as GraphNode).slug;
          if (slug) router.push(`/dashboard/threads/${slug}`);
        });
        fg.onNodeHover((n: unknown | null) => {
          if (cancelled) return;
          setHover(n as GraphNode | null);
          if (containerRef.current) containerRef.current.style.cursor = n ? 'pointer' : 'grab';
        });

        try {
          fg.d3Force('link', null);
        } catch {
          // ignore if d3Force not available
        }

        zoomTimeout = setTimeout(() => {
          try { (fg as unknown as { zoomToFit: (a: number, b: number) => void }).zoomToFit(400, 40); } catch {}
        }, 420);

        const handleResize = () => {
          if (!el || cancelled) return;
          try {
            fg.width(el.clientWidth);
            const h = Math.min(560, Math.max(360, window.innerHeight * 0.58));
            fg.height(h);
            el.style.height = `${h}px`;
          } catch {}
        };
        window.addEventListener('resize', handleResize);
        instance = {
          _destructor: () => {
            if (zoomTimeout) clearTimeout(zoomTimeout);
            window.removeEventListener('resize', handleResize);
            try { el.innerHTML = ''; } catch {}
          },
        };
      } catch (e) {
        setRenderError(e instanceof Error ? e.message : String(e));
      }
    }

    mount();
    return () => {
      cancelled = true;
      if (zoomTimeout) clearTimeout(zoomTimeout);
      try { instance?._destructor?.(); } catch {}
    };
  }, [nodes, links, router]);

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
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line bg-canvas/60">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <Input aria-label="Search threads in graph" placeholder="Search threads in graph…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-sm bg-surface" />
          {search && <button aria-label="Clear search" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"><X size={14}/></button>}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button aria-label="Zoom in" variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => { try { (fgRef.current as unknown as { zoom: (k: number, ms: number) => void })?.zoom(1.4, 300); } catch {} }}><ZoomIn size={14}/></Button>
          <Button aria-label="Zoom out" variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => { try { (fgRef.current as unknown as { zoom: (k: number, ms: number) => void })?.zoom(0.7, 300); } catch {} }}><ZoomOut size={14}/></Button>
          <Button aria-label="Fit graph" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => { try { (fgRef.current as unknown as { zoomToFit: (a: number, b: number) => void })?.zoomToFit(400, 40); } catch {} }}><Maximize2 size={14}/> Fit</Button>
        </div>
      </div>
      <div className="relative">
        <div ref={containerRef} className="w-full bg-canvas" style={{ minHeight: 380, backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.18) 1px, transparent 0)', backgroundSize: '18px 18px' }} />
        {hover && (
          <div className="absolute left-3 top-3 max-w-[280px] rounded-card border border-line bg-surface shadow-lg p-3 pointer-events-none">
            <p className="text-sm font-semibold text-ink leading-snug line-clamp-2">{hover.name}</p>
            <p className="text-xs text-ink-3 mt-1 line-clamp-1">/{hover.slug}</p>
            <div className="flex items-center gap-1.5 mt-2 text-xs">
              <span className="size-2 rounded-full bg-brand animate-pulse" />
              <span className="text-ink-2">{degree.get(hover.id) ?? 0} connections</span>
              <span className="text-ink-3">· click to open</span>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 border-t border-line bg-surface text-xs">
        <span className="text-ink-3 flex items-center gap-1.5">
          <span className="hidden sm:inline">Drag to pan · scroll to zoom · </span>click node to open · {nodes.length} nodes
        </span>
        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-emerald-500 shadow-sm" /> 85%+ high</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-amber-500 shadow-sm" /> 70–85%</span>
          <span className="hidden sm:inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-slate-400" /> &lt;70%</span>
        </span>
      </div>
    </div>
  );
}

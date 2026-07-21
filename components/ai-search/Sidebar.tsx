'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Search, Code2, Trash2, CornerDownRight } from 'lucide-react';
import { TimeAgo } from '@/components/ui/TimeAgo';
import type { Source, SynthesisResult, Citation } from '@/modules/ai-search/types';

export interface HistoryItem {
  id: string;
  query: string;
  queryType: string | null;
  title: string | null;
  synthesis: string;
  citations: Citation[];
  sourceCount: number;
  sources: Source[];
  followUps: string[];
  conflictData: SynthesisResult['conflictData'];
  parentSessionId: string | null;
  createdAt: string;
  children?: HistoryItem[];
}

interface SidebarProps {
  onSelectSession: (item: HistoryItem) => void;
  onNewSearch: () => void;
  collapsed: boolean;
  onOpenApiKeys: () => void;
  hasApiKeys: boolean;
}

function label(item: HistoryItem): string {
  const t = item.title?.trim();
  if (t) return t.length > 38 ? t.substring(0, 38) + '…' : t;
  const q = item.query.trim();
  return q.length > 38 ? q.substring(0, 38) + '…' : q;
}

export function Sidebar({
  onSelectSession,
  onNewSearch,
  collapsed,
  onOpenApiKeys,
  hasApiKeys,
}: SidebarProps) {
  const [searches, setSearches] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  const loadHistory = useCallback(async (reset: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ threaded: '1', limit: '20' });
      if (!reset && cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/ai/search-history?${params.toString()}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return;
      const body = await res.json();
      const data = body?.data as { sessions?: Record<string, unknown>[]; nextCursor?: string | null } | undefined;
      if (!body?.success || !data) return;
      const fetched: HistoryItem[] = (data.sessions ?? []).map((s: Record<string, unknown>) => {
        const children = ((s.children as Record<string, unknown>[]) ?? []).map(
          (c: Record<string, unknown>) =>
            ({
              ...c,
              createdAt: c.createdAt ? String(c.createdAt) : new Date().toISOString(),
            }) as HistoryItem
        );
        return {
          ...s,
          children,
          createdAt: s.createdAt ? String(s.createdAt) : new Date().toISOString(),
        } as HistoryItem;
      });
      setSearches((prev) => (reset ? fetched : [...prev, ...fetched]));
      setCursor(data.nextCursor ?? null);
      setHasMore(Boolean(data.nextCursor));
    } catch {
      /* network errors are non-fatal for history */
    } finally {
      setLoading(false);
    }
  }, [cursor]);

  useEffect(() => {
    if (collapsed) return;
    // loadHistory performs an async fetch; the synchronous setLoading here is
    // the intended loading flag, not cascading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHistory(true);
  }, [collapsed, loadHistory]);

  const handleDelete = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        const res = await fetch(`/api/ai/search-history?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          setSearches((prev) => prev.filter((s) => s.id !== id && s.parentSessionId !== id));
        }
      } catch {
        /* ignore */
      }
    },
    []
  );

  const renderItem = (item: HistoryItem, depth: number) => (
    <div
      key={item.id}
      className="group relative"
      onMouseEnter={() => setHoveredId(item.id)}
      onMouseLeave={() => setHoveredId(null)}
    >
      <button
        onClick={() => onSelectSession(item)}
        className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors truncate flex items-center gap-1.5"
        style={{ paddingLeft: depth > 0 ? 22 : 12 }}
      >
        {depth > 0 && <CornerDownRight size={11} className="shrink-0 text-muted-foreground/40" />}
        <span className="truncate block flex-1">{label(item)}</span>
      </button>
      <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-[10px] text-muted-foreground/50 pointer-events-none">{item.sourceCount} src</span>
        <button
          onClick={(e) => handleDelete(item.id, e)}
          className="p-0.5 text-muted-foreground/50 hover:text-destructive transition-colors"
          aria-label="Remove from history"
        >
          <Trash2 size={11} />
        </button>
      </span>
    </div>
  );

  return (
    <div
      className={`relative h-full flex flex-col bg-card border border-border rounded-2xl transition-all duration-250 ease-in-out overflow-hidden ${
        collapsed ? 'w-0 border-0 p-0' : 'w-[220px]'
      }`}
    >
      {!collapsed && (
        <>
          <div className="px-4 pt-4 pb-2">
            <h2 className="text-sm font-semibold text-foreground tracking-tight">Sai</h2>
          </div>

          <div className="px-2 space-y-0.5">
            <button
              onClick={onNewSearch}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
            >
              <Plus size={14} />
              New Search
            </button>

            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"
              onClick={() => loadHistory(true)}
            >
              <Search size={14} />
              {loading ? 'Loading…' : 'Past Searches'}
            </button>

            <button
              onClick={onOpenApiKeys}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
            >
              <Code2 size={14} />
              API Keys
              {hasApiKeys && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500" />}
            </button>
          </div>

          <div className="mx-3 my-3 h-px bg-border" />

          <div
            className="flex-1 overflow-y-auto px-2"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (
                hasMore &&
                !loading &&
                el.scrollHeight - el.scrollTop - el.clientHeight < 80 &&
                listEndRef.current
              ) {
                loadHistory(false);
              }
            }}
          >
            {searches.length === 0 ? (
              <p className="px-3 text-[11px] text-muted-foreground/50 italic">
                {loading ? 'Loading…' : 'No recent searches'}
              </p>
            ) : (
              <div className="space-y-0.5" ref={listEndRef}>
                {searches.map((s) => (
                  <div key={s.id}>
                    {renderItem(s, 0)}
                    {s.children && s.children.length > 0 && (
                      <div className="ml-2">
                        {s.children.map((c) => renderItem(c, 1))}
                      </div>
                    )}
                  </div>
                ))}
                {hasMore && (
                  <p className="px-3 py-2 text-[10px] text-muted-foreground/40 text-center">Load more…</p>
                )}
              </div>
            )}
          </div>

          <div className="px-3 pb-3 pt-2 border-t border-border mt-auto">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-foreground/10 flex items-center justify-center text-[10px] font-bold text-foreground">
                S
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">Sastram User</p>
                <p className="text-[10px] text-muted-foreground truncate">Personal workspace</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

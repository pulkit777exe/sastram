'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Search, Code2, Trash2, CornerDownRight, RefreshCw, Check } from 'lucide-react';
import type { Source, SynthesisResult, Citation } from '@/modules/ai-search/types';
import Image from 'next/image';

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
  /** Currently open session, so the matching row can show it's selected. */
  currentSessionId?: string;
  user?: { name?: string | null; email?: string | null; image?: string | null } | null;
}

function label(item: HistoryItem): string {
  const t = item.title?.trim();
  if (t) return t.length > 38 ? t.substring(0, 38) + '…' : t;
  const q = item.query.trim();
  return q.length > 38 ? q.substring(0, 38) + '…' : q;
}

function dateGroup(createdAt: string): string {
  const d = new Date(createdAt);
  const now = new Date();
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);

  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return 'This week';
  return 'Earlier';
}

export function Sidebar({
  onSelectSession,
  onNewSearch,
  collapsed,
  onOpenApiKeys,
  hasApiKeys,
  currentSessionId,
  user,
}: SidebarProps) {
  const [searches, setSearches] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  // Two-step delete: first click arms it, second click (within 3s) confirms.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDeleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHistory(true);
  }, [collapsed, loadHistory]);

  useEffect(() => {
    return () => {
      if (pendingDeleteTimer.current) clearTimeout(pendingDeleteTimer.current);
    };
  }, []);

  const armDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (pendingDeleteTimer.current) clearTimeout(pendingDeleteTimer.current);
    setPendingDeleteId(id);
    pendingDeleteTimer.current = setTimeout(() => setPendingDeleteId(null), 3000);
  }, []);

  const confirmDelete = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (pendingDeleteTimer.current) clearTimeout(pendingDeleteTimer.current);
      setPendingDeleteId(null);
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

  const handleDeleteClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (pendingDeleteId === id) {
        confirmDelete(id, e);
      } else {
        armDelete(id, e);
      }
    },
    [pendingDeleteId, armDelete, confirmDelete]
  );

  const renderItem = (item: HistoryItem, depth: number) => {
    const isSelected = item.id === currentSessionId;
    const isPendingDelete = pendingDeleteId === item.id;

    return (
      <div key={item.id} className="group relative">
        {isSelected && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-foreground" />
        )}
        <button
          onClick={() => onSelectSession(item)}
          aria-current={isSelected ? 'true' : undefined}
          className={`w-full text-left px-3 py-1.5 text-xs rounded-lg transition-colors truncate flex items-center gap-1.5 ${
            isSelected
              ? 'bg-foreground/10 text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
          }`}
          style={{ paddingLeft: depth > 0 ? 22 : 12 }}
        >
          {depth > 0 && <CornerDownRight size={11} className="shrink-0 text-muted-foreground/40" />}
          <span className="truncate block flex-1">{label(item)}</span>
        </button>
        <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isPendingDelete && (
            <span className="text-[10px] text-muted-foreground/50 pointer-events-none">
              {item.sourceCount} src
            </span>
          )}
          <button
            onClick={(e) => handleDeleteClick(item.id, e)}
            className={`p-0.5 transition-colors rounded ${
              isPendingDelete
                ? 'text-destructive bg-destructive/10 opacity-100'
                : 'text-muted-foreground/50 hover:text-destructive'
            }`}
            aria-label={isPendingDelete ? 'Confirm delete' : 'Remove from history'}
            title={isPendingDelete ? 'Click again to delete' : 'Remove from history'}
          >
            {isPendingDelete ? <Check size={11} /> : <Trash2 size={11} />}
          </button>
        </span>
      </div>
    );
  };

  const userInitial =
    user?.name?.trim()?.[0]?.toUpperCase() ||
    user?.email?.trim()?.[0]?.toUpperCase() ||
    '?';

  const groupedSearches: { group: string; items: HistoryItem[] }[] = [];
  for (const item of searches) {
    const group = dateGroup(item.createdAt);
    const last = groupedSearches[groupedSearches.length - 1];
    if (last && last.group === group) {
      last.items.push(item);
    } else {
      groupedSearches.push({ group, items: [item] });
    }
  }

  return (
    <div
      className={`relative h-full flex flex-col bg-card border border-border rounded-2xl transition-all duration-250 ease-in-out overflow-hidden ${
        collapsed ? 'w-0 border-0 p-0' : 'w-55'
      }`}
    >
      {!collapsed && (
        <>
          <div className="px-4 pt-4 pb-2">
            <h2 className="text-sm font-semibold text-foreground tracking-tight">Sai</h2>
        </div>

          <div className="px-3 space-y-0.5">
            <button
              onClick={onNewSearch}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
            >
              <Plus size={14} />
              New Search
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

          {/* History section header — label is static, refresh is its own affordance */}
          <div className="flex items-center justify-between px-3">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              <Search size={11} />
              History
          </span>
            <button
              onClick={() => loadHistory(true)}
              disabled={loading}
              aria-label="Refresh search history"
              title="Refresh"
              className="p-1 text-muted-foreground/60 hover:text-foreground rounded-md hover:bg-foreground/5 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

          <div
            className="flex-1 overflow-y-auto mt-1"
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
              <div ref={listEndRef}>
                {groupedSearches.map(({ group, items }) => (
                  <div key={group} className="mb-3 last:mb-0">
                    <p className="px-3 pb-1 text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">
                      {group}
                 </p>
                    <div className="space-y-0.5">
                      {items.map((s) => (
                        <div key={s.id}>
                          {renderItem(s, 0)}
                          {s.children && s.children.length > 0 && (
                            <div className="ml-2">
                              {s.children.map((c) => renderItem(c, 1))}
                          </div>
                          )}
                    </div>
                      ))}
                 </div>
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
              {user?.image ? (
                <Image
                  src={user.image}
                  alt=""
                  width={28}
                  height={28}
                  className="w-7 h-7 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-foreground/10 flex items-center justify-center text-[10px] font-bold text-foreground shrink-0">
                  {userInitial}
              </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {user?.name || user?.email || 'Guest'}
            </p>
                <p className="text-[10px] text-muted-foreground truncate">Personal workspace</p>
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
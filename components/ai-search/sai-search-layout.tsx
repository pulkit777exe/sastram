'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Clock,
  Plus,
  Check,
  Trash2,
  CornerDownRight,
  KeyRound,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
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

interface SaiSearchLayoutProps {
  children: React.ReactNode;
  onSelectSession?: (item: HistoryItem) => void;
  onNewSearch?: () => void;
  currentSessionId?: string;
  hasApiKeys?: boolean;
  onOpenApiKeys?: () => void;
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

export function SaiSearchLayout({
  children,
  onSelectSession,
  onNewSearch,
  currentSessionId,
  hasApiKeys = false,
  onOpenApiKeys,
}: SaiSearchLayoutProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [searches, setSearches] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
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
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, [cursor]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) loadHistory(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const confirmDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (pendingDeleteTimer.current) clearTimeout(pendingDeleteTimer.current);
    setPendingDeleteId(null);
    try {
      const res = await fetch(`/api/ai/search-history?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) {
        setSearches((prev) => prev.filter((s) => s.id !== id && s.parentSessionId !== id));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const handleDeleteClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (pendingDeleteId === id) confirmDelete(id, e);
      else armDelete(id, e);
    },
    [pendingDeleteId, armDelete, confirmDelete]
  );

  const groupedSearches: { group: string; items: HistoryItem[] }[] = [];
  for (const item of searches) {
    const group = dateGroup(item.createdAt);
    const last = groupedSearches[groupedSearches.length - 1];
    if (last && last.group === group) last.items.push(item);
    else groupedSearches.push({ group, items: [item] });
  }

  const renderItem = (item: HistoryItem, depth: number) => {
    const isSelected = item.id === currentSessionId;
    const isPendingDelete = pendingDeleteId === item.id;

    return (
      <div key={item.id} className="group relative">
        {isSelected && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-sai-accent" />}
        <button type="button"
          onClick={() => {
            onSelectSession?.(item);
            setHistoryOpen(false);
          }}
          aria-current={isSelected ? 'true' : undefined}
          className={cn(
            'w-full text-left pr-3 py-1.5 text-xs rounded-control transition-colors truncate flex items-center gap-1.5',
            isSelected
              ? 'bg-hover/80 text-ink font-medium'
              : 'text-ink-2 hover:text-ink hover:bg-hover/40'
          )}
          style={{ paddingLeft: depth > 0 ? 22 : 12 }}
        >
          {depth > 0 && <CornerDownRight size={11} className="shrink-0 text-ink-3" />}
          <span className="truncate block flex-1">{label(item)}</span>
        </button>
        <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isPendingDelete && <span className="text-xs text-ink-3 pointer-events-none">{item.sourceCount} src</span>}
          <button type="button"
            onClick={(e) => handleDeleteClick(item.id, e)}
            className={cn(
              'p-0.5 transition-colors rounded',
              isPendingDelete ? 'text-red-400 bg-red-500/10 opacity-100' : 'text-ink-3 hover:text-red-400'
            )}
            aria-label={isPendingDelete ? 'Confirm delete' : 'Remove from history'}
            title={isPendingDelete ? 'Click again to delete' : 'Remove from history'}
          >
            {isPendingDelete ? <Check size={11} /> : <Trash2 size={11} />}
          </button>
        </span>
      </div>
    );
  };

  return (
    <div className="flex h-full w-full overflow-hidden">

      {/* Content column */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* Header bar */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-line/60 shrink-0">
          <div className="flex items-center gap-1">
            <button type="button"
              onClick={onNewSearch}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-2 hover:text-ink hover:bg-hover/40 transition-colors"
              title="New search"
            >
              <Plus size={16} />
            </button>
            <button type="button"
              onClick={() => setHistoryOpen(true)}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-2 hover:text-ink hover:bg-hover/40 transition-colors"
              title="Search history"
            >
              <Clock size={16} />
            </button>
            <span className="ml-2 text-sm font-semibold text-ink tracking-tight">Sai Search</span>
          </div>
          <button type="button"
            onClick={onOpenApiKeys}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-2 hover:text-ink hover:bg-hover/40 transition-colors shrink-0 relative"
            title="API Keys"
          >
            <KeyRound size={15} />
            {hasApiKeys && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-sai-green" />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>

      {/* History drawer */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div
            className="absolute inset-0 bg-ink/20 backdrop-blur-sm"
            onClick={() => setHistoryOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-80 max-w-[85vw] bg-canvas border-r border-line shadow-overlay flex flex-col animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
              <span className="text-sm font-semibold text-ink tracking-tight">History</span>
              <button type="button"
                onClick={() => setHistoryOpen(false)}
                className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-3 hover:text-ink hover:bg-hover/40 transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            <div
              className="flex-1 min-h-0 overflow-y-auto"
              onScroll={(e) => {
                const el = e.currentTarget;
                if (hasMore && !loading && el.scrollHeight - el.scrollTop - el.clientHeight < 80 && listEndRef.current) {
                  loadHistory(false);
                }
              }}
            >
              {searches.length === 0 ? (
                <p className="px-5 text-xs text-ink-3 italic">{loading ? 'Loading…' : 'No recent searches'}</p>
              ) : (
                <div ref={listEndRef} className="px-3">
                  {groupedSearches.map(({ group, items }) => (
                    <div key={group} className="mb-3 last:mb-0">
                      <p className="px-2 pb-1 text-[11px] text-ink-3">{group}</p>
                      <div className="space-y-0.5">
                        {items.map((s) => (
                          <div key={s.id}>
                            {renderItem(s, 0)}
                            {s.children && s.children.length > 0 && (
                              <div className="ml-2">{s.children.map((c) => renderItem(c, 1))}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {hasMore && <p className="py-2 text-xs text-ink-3 text-center">Load more…</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

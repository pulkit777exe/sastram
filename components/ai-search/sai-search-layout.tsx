'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  RefreshCw,
  Check,
  Trash2,
  CornerDownRight,
  KeyRound,
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
  const router = useRouter();
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
        <button
          onClick={() => onSelectSession?.(item)}
          aria-current={isSelected ? 'true' : undefined}
          className={cn(
            'w-full text-left pr-3 py-1.5 text-xs rounded-lg transition-colors truncate flex items-center gap-1.5',
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
          <button
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

      {/* History sidebar — integrated into canvas, no hard border */}
      <div className="w-72 h-full shrink-0 flex flex-col overflow-hidden border-r border-line/60">
        <div className="px-5 pt-5 pb-3 shrink-0">
          <h2 className="text-sm font-semibold text-ink tracking-tight">Sai</h2>
        </div>

        <div className="px-3 shrink-0">
          <button
            onClick={onNewSearch}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink-2 hover:text-ink hover:bg-hover/40 rounded-lg transition-colors"
          >
            <Plus size={14} />
            New Search
          </button>
        </div>

        <div className="mx-5 my-3 h-px bg-line/60 shrink-0" />

        <div className="flex items-center justify-between px-5 shrink-0">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-3 uppercase tracking-wider">
            <Search size={11} />
            History
          </span>
          <button
            onClick={() => loadHistory(true)}
            disabled={loading}
            aria-label="Refresh search history"
            title="Refresh"
            className="p-1 text-ink-3 hover:text-ink rounded-md hover:bg-hover/40 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div
          className="flex-1 min-h-0 overflow-y-auto mt-1"
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
                  <p className="px-2 pb-1 text-[11px] font-semibold text-ink-3 uppercase tracking-wider">{group}</p>
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

      {/* Content column */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* Header bar — clean, editorial */}
        <div className="h-12 flex items-center justify-between px-6 border-b border-line/60 shrink-0">
          <span className="text-xs font-semibold text-ink tracking-tight">Sai Search</span>
          <button
            onClick={onOpenApiKeys}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-2 hover:text-ink rounded-lg hover:bg-hover/40 transition-colors shrink-0"
          >
            <KeyRound size={13} />
            <span>API Keys</span>
            {hasApiKeys && <span className="w-1.5 h-1.5 rounded-full bg-sai-green" />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>

    </div>
  );
}
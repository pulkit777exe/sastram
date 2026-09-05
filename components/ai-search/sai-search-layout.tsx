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
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { Source, SynthesisResult, Citation } from '@/modules/ai-search/types';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';
import { truncateHistoryLabel, groupByHistoryDate } from '@/lib/utils/format';

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

// Helpers now imported from lib/utils/format at top

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
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDeleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  const loadHistory = useCallback(async (reset: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ threaded: '1', limit: '20' });
      const currentCursor = reset ? null : cursorRef.current;
      if (currentCursor) params.set('cursor', currentCursor);
      const res = await fetch(`/api/ai/search-history?${params.toString()}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        setError('Failed to load search history. Please try again.');
        return;
      }
      const body = await res.json();
      const data = body?.data as { sessions?: Record<string, unknown>[]; nextCursor?: string | null } | undefined;
      if (!body?.success || !data) {
        setError('Failed to load search history. Please try again.');
        return;
      }
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
      const nextCursor = data.nextCursor ?? null;
      cursorRef.current = nextCursor;
      setHasMore(Boolean(data.nextCursor));
    } catch {
      setError('Failed to load search history. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) loadHistory(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loadHistory]);

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

    // Optimistic removal
    setSearches((prev) => {
      const removed = prev.filter((s) => s.id !== id && s.parentSessionId !== id);
      return removed;
    });

    try {
      const res = await fetch(`/api/ai/search-history?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        // Rollback on failure — reload from server
        loadHistory(true);
      }
    } catch {
      // Rollback on failure — reload from server
      loadHistory(true);
    }
  }, [loadHistory]);

  const handleDeleteClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (pendingDeleteId === id) confirmDelete(id, e);
      else armDelete(id, e);
    },
    [pendingDeleteId, armDelete, confirmDelete]
  );

  const groupedSearches = groupByHistoryDate(searches);

  const renderItem = (item: HistoryItem, depth: number) => {
    const isSelected = item.id === currentSessionId;
    const isPendingDelete = pendingDeleteId === item.id;

    // Tailwind: layout / color / interactivity grouped
    const historyItemBase = 'w-full justify-start pr-3 py-1.5 text-xs rounded-control truncate h-auto';
    const historyItemActive = 'bg-hover/80 text-ink font-medium';
    const historyItemIdle = 'text-ink-2 hover:text-ink hover:bg-hover/40';
    const historyItemClasses = cn(historyItemBase, isSelected ? historyItemActive : historyItemIdle);

    return (
      <div key={item.id} className="group relative">
        {isSelected && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-sai-accent" />}
        <Button type="button"
          onClick={() => {
            onSelectSession?.(item);
            setHistoryOpen(false);
          }}
          aria-current={isSelected ? 'true' : undefined}
          variant="ghost"
          className={historyItemClasses}
          style={{ paddingLeft: depth > 0 ? 22 : 12 }}
        >
          {depth > 0 && <CornerDownRight size={11} className="shrink-0 text-ink-3" />}
          <span className="truncate block flex-1">{truncateHistoryLabel(item.title, item.query)}</span>
        </Button>
        <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isPendingDelete && <span className="text-xs text-ink-3 pointer-events-none">{item.sourceCount} src</span>}
          <Button type="button"
            onClick={(e) => handleDeleteClick(item.id, e)}
            variant="ghost"
            size="icon-sm"
            className={cn(
              'p-0.5',
              isPendingDelete ? 'text-red-400 bg-red-500/10 opacity-100' : 'text-ink-3 hover:text-red-400'
            )}
            aria-label={isPendingDelete ? 'Confirm delete' : 'Remove from history'}
            title={isPendingDelete ? 'Click again to delete' : 'Remove from history'}
          >
            {isPendingDelete ? <Check size={11} /> : <Trash2 size={11} />}
          </Button>
        </span>
      </div>
    );
  };

  return (
    <div className="flex h-full w-full overflow-hidden">

      {/* Content column */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* Header bar — modern secondary toolbar, simple */}
        <div className="h-14 flex items-center justify-between gap-3 px-4 bg-surface/80 backdrop-blur-md border-b border-line shrink-0 supports-[backdrop-filter]:bg-surface/60">
          <div className="flex items-center gap-2 min-w-0">
            <Logo className="size-6 shrink-0 hidden sm:block" />
            <span className="font-serif-heading text-[15px] font-medium tracking-tight text-ink truncate">Sai Search</span>
            <span className="hidden sm:inline-flex items-center rounded-full bg-sai-accent/10 px-2 py-0.5 text-[10px] font-medium tracking-wider text-sai-accent uppercase">Beta</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button type="button"
              onClick={() => setHistoryOpen(true)}
              variant="ghost"
              size="icon"
              title="Search history"
              className="size-8 rounded-full"
            >
              <Clock size={16} />
            </Button>
            <Button type="button"
              onClick={onNewSearch}
              variant="ghost"
              size="sm"
              title="New search"
              className="h-8 rounded-full gap-1.5 px-3 border border-line bg-surface hover:bg-hover"
            >
              <Plus size={14} />
              <span className="hidden xs:inline text-xs font-medium">New</span>
            </Button>
            <Button type="button"
              onClick={onOpenApiKeys}
              variant="ghost"
              size="icon"
              title="API Keys"
              className="size-8 rounded-full relative"
            >
              <KeyRound size={15} />
              {hasApiKeys && <span className="absolute top-1 right-1 size-2 rounded-full bg-sai-green ring-2 ring-surface" />}
            </Button>
          </div>
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
              <Button type="button"
                onClick={() => setHistoryOpen(false)}
                variant="ghost"
                size="icon-sm"
              >
                <X size={15} />
              </Button>
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
              {error ? (
                <div className="flex flex-col items-center justify-center px-5 py-8 text-center">
                  <AlertCircle size={20} className="text-sai-red mb-2" />
                  <p className="text-xs text-ink-2 mb-3">{error}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => loadHistory(true)}
                  >
                    Retry
                  </Button>
                </div>
              ) : searches.length === 0 ? (
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

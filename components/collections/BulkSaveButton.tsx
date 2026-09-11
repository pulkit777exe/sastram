'use client';

import { useEffect, useRef, useState } from 'react';
import { Bookmark, Check, Plus, Loader2, BookmarkPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toasts } from '@/lib/utils/toast';
import { getCollectionsCache, setCollectionsCache, invalidateCollectionsCache } from './collections-cache';

type BulkItem = { threadId?: string; sessionId?: string; messageId?: string; metadata?: unknown };

export function BulkSaveButton({ items, label }: { items: BulkItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState<{ id: string; title: string }[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const count = items.length;
  const displayLabel = label ?? `Save all (${count})`;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const cached = getCollectionsCache();
    if (cached) {
      setCollections(cached);
      setLoading(false);
    } else {
      setLoading(true);
      fetch('/api/collections?light=1')
        .then((r) => {
          if (!r.ok) {
            if (r.status === 401 || r.status === 403 || r.status === 429) {
              if (!cancelled) setCollections([]);
              throw new Error('auth');
            }
            throw new Error('Failed to load');
          }
          return r.json();
        })
        .then((j) => {
          if (cancelled) return;
          const data = (j.data ?? []) as { id: string; title: string }[];
          setCollections(data);
          setCollectionsCache(data);
        })
        .catch((e) => {
          if (cancelled) return;
          if (e instanceof Error && e.message === 'auth') return;
          toasts.error('Failed to load collections');
        })
        .finally(() => {
          if (cancelled) return;
          setLoading(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function bulkAddTo(collectionId: string) {
    if (count === 0) return;
    setSaving(true);
    setProgress({ done: 0, total: count });
    let saved = 0;
    let skipped = 0;
    let failed = 0;
    const CONCURRENCY = 3;
    for (let i = 0; i < items.length; i += CONCURRENCY) {
      const batch = items.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (payload) => {
          if (!payload.threadId && !payload.sessionId && !payload.messageId && !payload.metadata) return 'skipped' as const;
          try {
            const res = await fetch(`/api/collections/${collectionId}/items`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            if (res.ok) return 'saved' as const;
            if (res.status === 409) return 'skipped' as const;
            return 'failed' as const;
          } catch {
            return 'failed' as const;
          }
        })
      );
      for (const r of results) {
        if (r === 'saved') saved++;
        else if (r === 'skipped') skipped++;
        else failed++;
      }
      setProgress({ done: Math.min(i + CONCURRENCY, count), total: count });
    }
    setSaving(false);
    setProgress(null);
    if (saved > 0) toasts.success(`Saved ${saved} item${saved === 1 ? '' : 's'}${skipped ? `, ${skipped} already saved` : ''}${failed ? `, ${failed} failed` : ''}`);
    else if (skipped > 0 && failed === 0) toasts.error('All items already saved to this collection');
    else if (failed > 0) toasts.error(`Saved ${saved}, ${failed} failed`);
    else toasts.error('Nothing to save');
    if (saved > 0) setOpen(false);
  }

  async function createAndBulkAdd() {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (res.status === 409) {
          toasts.error(j?.error?.message || 'Already exists');
          return;
        }
        throw new Error(j?.error?.message || 'Create failed');
      }
      const j = await res.json();
      const coll = j.data;
      if (coll?.id) {
        invalidateCollectionsCache();
        setNewTitle('');
        await bulkAddTo(coll.id);
      }
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  }

  if (count === 0) return null;

  return (
    <div className="relative" ref={containerRef}>
      <Button variant="outline" size="sm" className="h-7 gap-1.5 rounded-full border-line bg-surface hover:bg-hover" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog">
        <BookmarkPlus size={12} /> {displayLabel}
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-card border border-line bg-surface p-2 shadow-xl">
          <p className="px-2 pb-2 text-xs font-medium text-ink">Save all {count} to collection</p>
          <div className="flex gap-1.5 px-1 pb-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createAndBulkAdd()}
              placeholder="New collection"
              className="flex-1 rounded-control border border-line bg-field px-2 py-1.5 text-xs focus:outline-none focus:border-line-strong"
            />
            <Button size="sm" className="h-7 px-2" onClick={createAndBulkAdd} disabled={saving || !newTitle.trim()}>
              <Plus size={12} />
            </Button>
          </div>
          {progress && (
            <p className="flex items-center gap-2 px-2 pb-2 text-xs text-ink-3">
              <Loader2 size={12} className="animate-spin" /> Saving {progress.done}/{progress.total}...
            </p>
          )}
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {loading ? (
              <p className="flex items-center gap-2 px-2 py-2 text-xs text-ink-3">
                <Loader2 size={12} className="animate-spin" /> Loading...
              </p>
            ) : (
              collections.map((c) => (
                <button
                  key={c.id}
                  onClick={() => bulkAddTo(c.id)}
                  className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-xs hover:bg-hover"
                  disabled={saving}
                >
                  <Bookmark size={12} className="text-ink-3" />
                  <span className="truncate">{c.title}</span>
                  <Check size={12} className="ml-auto opacity-0" />
                </button>
              ))
            )}
            {!loading && collections.length === 0 && (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center mb-2">
                  <Bookmark size={14} className="text-muted-foreground" />
                </div>
                <p className="text-xs font-medium text-ink">No collections yet</p>
                <p className="text-xs text-ink-3 mt-0.5">Create one above to get started</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

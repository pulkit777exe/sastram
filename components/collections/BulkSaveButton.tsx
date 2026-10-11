'use client';

import { memo, useState } from 'react';
import { Bookmark, Check, Plus, Loader2, BookmarkPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toasts } from '@/lib/utils/toast';
import { useCollectionsDropdown } from './use-collections-dropdown';

type BulkItem = { threadId?: string; sessionId?: string; messageId?: string; metadata?: unknown };

// Server bulk cap (mirrors MAX_BULK_ITEMS in the bulk route). Larger lists are
// sent as sequential single-fetch chunks so progress stays honest.
const BULK_CHUNK_SIZE = 50;

export const BulkSaveButton = memo(function BulkSaveButton({ items, label }: { items: BulkItem[]; label?: string }) {
  const { open, setOpen, collections, loading, newTitle, setNewTitle, containerRef, createCollectionFromInput } = useCollectionsDropdown();
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const count = items.length;
  const displayLabel = label ?? `Save all (${count})`;

  async function bulkAddTo(collectionId: string) {
    if (count === 0) return;
    const payloads = items.filter((p) => p.threadId || p.sessionId || p.messageId || p.metadata);
    if (payloads.length === 0) {
      toasts.error('Nothing to save');
      return;
    }
    setSaving(true);
    setProgress({ done: 0, total: payloads.length });
    let saved = 0;
    let skipped = 0;
    let failed = 0;
    try {
      for (let i = 0; i < payloads.length; i += BULK_CHUNK_SIZE) {
        const chunk = payloads.slice(i, i + BULK_CHUNK_SIZE);
        try {
          const res = await fetch(`/api/collections/${collectionId}/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: chunk }),
          });
          const j = await res.json().catch(() => null);
          if (!res.ok) throw new Error(j?.error?.message || 'Bulk save failed');
          saved += typeof j?.data?.saved === 'number' ? j.data.saved : 0;
          skipped += Array.isArray(j?.data?.skipped) ? j.data.skipped.length : 0;
          failed += Array.isArray(j?.data?.failed) ? j.data.failed.length : 0;
        } catch {
          failed += chunk.length;
        }
        setProgress({ done: Math.min(i + BULK_CHUNK_SIZE, payloads.length), total: payloads.length });
      }
    } finally {
      setSaving(false);
      setProgress(null);
    }
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
      const collectionId = await createCollectionFromInput();
      if (!collectionId) return;
      await bulkAddTo(collectionId);
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
        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-card border border-line bg-surface p-2 shadow-overlay">
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
                <div className="w-8 h-8 rounded-full bg-field flex items-center justify-center mb-2">
                  <Bookmark size={14} className="text-ink-2" />
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
});

'use client';

import { memo, useEffect, useState } from 'react';
import { Bookmark, Check, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toasts } from '@/lib/utils/toast';
import { cn } from '@/lib/utils/cn';
import { useCollectionsDropdown } from './use-collections-dropdown';

export const CollectionSaveButton = memo(function CollectionSaveButton({ threadId, sessionId, messageId, metadata, label = 'Save' }: { threadId?: string; sessionId?: string; messageId?: string; metadata?: unknown; label?: string }) {
  const { open, setOpen, collections, loading, newTitle, setNewTitle, containerRef, createCollectionFromInput } = useCollectionsDropdown();
  const [saving, setSaving] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const payload = { threadId, sessionId, messageId, metadata } as Record<string, unknown>;
  const metadataKey = metadata ? JSON.stringify(metadata) : '';

  // Pre-fetch saved state — shows Check when already in a collection
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSavedIds(new Set());
    let parsedMetadata: unknown = undefined;
    if (metadataKey) {
      try {
        parsedMetadata = JSON.parse(metadataKey) as unknown;
      } catch {
        parsedMetadata = undefined;
      }
    }
    const localPayload = { threadId, sessionId, messageId, metadata: parsedMetadata } as Record<string, unknown>;
    fetch('/api/collections/saved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(localPayload),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.data) return;
        setSavedIds(new Set(j.data as string[]));
      })
      .catch(() => {
        // best-effort — no toast, just no checkmarks
      });
    return () => {
      cancelled = true;
    };
  }, [open, threadId, sessionId, messageId, metadataKey]);

  async function addTo(collectionId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/collections/${collectionId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (res.status === 409) {
          toasts.error('Already saved to this collection');
          return;
        }
        throw new Error(j?.error?.message || 'Add failed');
      }
      toasts.success('Saved');
      setOpen(false);
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function createAndAdd() {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const collectionId = await createCollectionFromInput();
      if (!collectionId) return;
      await addTo(collectionId);
    } finally {
      setSaving(false);
    }
  }

  if (!threadId && !sessionId && !messageId && !metadata) return null;

  return (
    <div className="relative" ref={containerRef}>
      <Button variant="outline" size="sm" className="h-7 gap-1.5 rounded-full border-line bg-surface hover:bg-hover" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog">
        <Bookmark size={12} /> {label}
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-card border border-line bg-surface p-2 shadow-overlay">
          <p className="px-2 pb-2 text-xs font-medium text-ink">Save to collection</p>
          <div className="flex gap-1.5 px-1 pb-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createAndAdd()}
              placeholder="New collection"
              className="flex-1 rounded-control border border-line bg-field px-2 py-1.5 text-xs focus:outline-none focus:border-line-strong"
            />
            <Button size="sm" className="h-7 px-2" onClick={createAndAdd} disabled={saving || !newTitle.trim()}>
              <Plus size={12} />
            </Button>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {loading ? (
              <p className="flex items-center gap-2 px-2 py-2 text-xs text-ink-3">
                <Loader2 size={12} className="animate-spin" /> Loading...
              </p>
            ) : (
              collections.map((c) => {
                const isSaved = savedIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => addTo(c.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-xs hover:bg-hover',
                      isSaved && 'bg-green-tint'
                    )}
                    disabled={saving}
                    title={isSaved ? 'Already saved — click to try again' : undefined}
                  >
                    <Bookmark size={12} className={cn(isSaved ? 'text-green' : 'text-ink-3')} />
                    <span className={cn('truncate', isSaved && 'text-green')}>{c.title}</span>
                    <Check size={12} className={cn('ml-auto', isSaved ? 'opacity-100 text-green' : 'opacity-0')} />
                  </button>
                );
              })
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

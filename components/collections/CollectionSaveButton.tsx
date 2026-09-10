'use client';

import { useEffect, useRef, useState } from 'react';
import { Bookmark, Check, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toasts } from '@/lib/utils/toast';

export function CollectionSaveButton({ threadId, sessionId, messageId, metadata, label = 'Save' }: { threadId?: string; sessionId?: string; messageId?: string; metadata?: unknown; label?: string }) {
  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState<{ id: string; title: string }[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetch('/api/collections')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json();
      })
      .then((j) => {
        if (cancelled) return;
        setCollections(j.data ?? []);
      })
      .catch(() => {
        if (!cancelled) toasts.error('Failed to load collections');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Close on outside click / Escape - foolproof
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

  const payload = { threadId, sessionId, messageId, metadata } as Record<string, unknown>;

  async function createAndAdd() {
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
        const itemRes = await fetch(`/api/collections/${coll.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!itemRes.ok) {
          const jd = await itemRes.json().catch(() => ({}));
          if (itemRes.status === 409) {
            toasts.error('Already saved to this collection');
          } else {
            throw new Error(jd?.error?.message || 'Add failed');
          }
          return;
        }
        toasts.success('Saved to collection');
        setNewTitle('');
        setOpen(false);
      }
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function addTo(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/collections/${id}/items`, {
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

  if (!threadId && !sessionId && !messageId && !metadata) return null;

  return (
    <div className="relative" ref={containerRef}>
      <Button variant="outline" size="sm" className="h-7 gap-1.5 rounded-full border-line bg-surface hover:bg-hover" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog">
        <Bookmark size={12} /> {label}
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-card border border-line bg-surface p-2 shadow-xl">
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
              collections.map((c) => (
                <button
                  key={c.id}
                  onClick={() => addTo(c.id)}
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

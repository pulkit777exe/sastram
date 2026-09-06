'use client';

import { useEffect, useState } from 'react';
import { Bookmark, Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUserPreferences } from '@/hooks/use-user-preferences';

export function CollectionSaveButton({ threadId, sessionId }: { threadId?: string; sessionId?: string }) {
  const { prefs } = useUserPreferences();
  const enabled = (prefs as unknown as { collectionsEnabled?: boolean }).collectionsEnabled !== false;
  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState<{ id: string; title: string }[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !enabled) return;
    fetch('/api/collections')
      .then((r) => r.json())
      .then((j) => setCollections(j.data ?? []))
      .catch(() => {});
  }, [open, enabled]);

  async function createAndAdd() {
    if (!newTitle.trim()) return;
    setSaving(true);
    const res = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    const j = await res.json();
    const coll = j.data;
    if (coll?.id) {
      await fetch(`/api/collections/${coll.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, sessionId }),
      });
      setNewTitle('');
      setOpen(false);
    }
    setSaving(false);
  }

  async function addTo(id: string) {
    setSaving(true);
    await fetch(`/api/collections/${id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, sessionId }),
    });
    setSaving(false);
    setOpen(false);
  }

  if (!enabled) return null;
  if (!threadId && !sessionId) return null;

  return (
    <div className="relative">
      <Button variant="outline" size="sm" className="h-7 gap-1.5 rounded-full" onClick={() => setOpen((v) => !v)}>
        <Bookmark size={12} /> Save
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-card border border-line bg-surface p-2 shadow-xl">
          <p className="px-2 pb-2 text-xs font-medium text-ink">Save to collection</p>
          <div className="flex gap-1.5 px-1 pb-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="New collection"
              className="flex-1 rounded-control border border-line bg-field px-2 py-1.5 text-xs focus:outline-none focus:border-line-strong"
            />
            <Button size="sm" className="h-7 px-2" onClick={createAndAdd} disabled={saving || !newTitle.trim()}>
              <Plus size={12} />
            </Button>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {collections.map((c) => (
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
            ))}
            {collections.length === 0 && <p className="px-2 py-1 text-xs text-ink-3">No collections yet</p>}
          </div>
        </div>
      )}
    </div>
  );
}

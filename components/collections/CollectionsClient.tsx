'use client';

import React from 'react';
import Link from 'next/link';
import { Bookmark, Search, Plus, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toasts } from '@/lib/utils/toast';
import { useRouter } from 'next/navigation';

type Collection = { id: string; title: string; _count: { items: number }; updatedAt: Date | string };

export function CollectionsClient({ initial }: { initial: Collection[] }) {
  const [collections, setCollections] = React.useState<Collection[]>(initial);
  const [query, setQuery] = React.useState('');
  const [newTitle, setNewTitle] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const router = useRouter();

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return collections;
    return collections.filter((c) => c.title.toLowerCase().includes(q));
  }, [collections, query]);

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (title.length < 3) {
      toasts.error('Title must be at least 3 characters');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/collections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || 'Failed to create');
      const created = json.data as Collection;
      toasts.success('Collection created');
      setNewTitle('');
      setCollections((prev) => [created ?? { id: json.data?.id ?? Date.now().toString(), title, _count: { items: 0 }, updatedAt: new Date().toISOString() } as Collection, ...prev]);
      router.refresh();
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-2 flex-1">
          <Input placeholder="New collection title…" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreate()} className="flex-1 h-8 text-sm" />
          <Button size="sm" className="h-8" onClick={handleCreate} disabled={creating}>
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create
          </Button>
        </div>
        {collections.length > 3 && (
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <Input placeholder="Filter collections…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8 h-8 text-sm" />
            {query && <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"><X size={14}/></button>}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        query ? (
          <div className="flex flex-col items-center py-10 text-center rounded-card border border-dashed border-line bg-surface">
            <p className="text-sm font-medium text-ink">No matches for “{query}”</p>
            <Button variant="outline" size="sm" className="mt-3 h-7 text-xs" onClick={() => setQuery('')}>Clear filter</Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-line rounded-card bg-surface">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
              <Bookmark size={24} className="text-muted-foreground" />
            </div>
            <p className="text-lg font-semibold text-ink">No collections yet</p>
            <p className="text-sm text-ink-3 mt-1 max-w-sm">Save threads or Sai searches to a workspace to find them later.</p>
          </div>
        )
      ) : (
        <div className="grid gap-3">
          {filtered.map((c) => (
            <Link key={c.id} href={`/dashboard/collections/${c.id}`} className="rounded-card border border-line bg-surface p-4 hover:bg-hover shadow-card flex items-center justify-between">
              <div>
                <h2 className="font-medium text-sm text-ink">{c.title}</h2>
                <p className="text-xs text-ink-3">{c._count.items} items · updated {new Date(c.updatedAt).toLocaleDateString()}</p>
              </div>
              <span className="text-xs text-ink-3">{c._count.items} →</span>
            </Link>
          ))}
        </div>
      )}
      <p className="text-xs text-ink-3">{filtered.length} of {collections.length} collections{query ? ` for “${query}”` : ''}</p>
    </div>
  );
}

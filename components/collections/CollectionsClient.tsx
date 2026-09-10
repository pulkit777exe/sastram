'use client';

import React from 'react';
import Link from 'next/link';
import { Search, Plus, Loader2, X, FolderOpen, FileText, Sparkles, MoreHorizontal, Trash2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toasts } from '@/lib/utils/toast';
import { useRouter } from 'next/navigation';

type Collection = { id: string; title: string; _count: { items: number }; updatedAt: Date | string };

const GRADIENTS = [
  'from-zinc-800 via-zinc-800 to-zinc-900',
  'from-slate-800 via-slate-800 to-zinc-900',
  'from-neutral-800 via-stone-800 to-zinc-900',
  'from-zinc-700 via-slate-800 to-zinc-900',
  'from-stone-800 via-zinc-800 to-neutral-900',
  'from-zinc-900 via-zinc-800 to-zinc-900',
];

function hashToGradient(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

export function CollectionsClient({ initial }: { initial: Collection[] }) {
  const [collections, setCollections] = React.useState<Collection[]>(initial);
  const [query, setQuery] = React.useState('');
  const [newTitle, setNewTitle] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [view, setView] = React.useState<'grid' | 'list'>('grid');
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

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/collections/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      toasts.success('Collection deleted');
      setCollections((prev) => prev.filter((c) => c.id !== id));
      router.refresh();
    } catch {
      toasts.error('Failed to delete');
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-card border border-line bg-surface shadow-card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-2 flex-1">
            <div className="relative flex-1">
              <FolderOpen size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <Input placeholder="New collection — e.g. Q4 Research" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreate()} className="pl-9 h-9 text-sm bg-canvas border-line focus-visible:ring-brand/20" />
            </div>
            <Button size="sm" className="h-9 px-4 gap-1.5 shadow-sm" onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
              <Input aria-label="Filter collections" placeholder="Filter…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8 h-9 text-sm bg-canvas" />
              {query && <button aria-label="Clear filter" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"><X size={14}/></button>}
            </div>
            <div className="hidden sm:flex items-center rounded-control border border-line bg-canvas p-0.5">
              <button onClick={() => setView('grid')} className={`px-2.5 py-1 rounded-sm text-xs font-medium transition-colors ${view==='grid' ? 'bg-surface shadow-sm text-ink' : 'text-ink-3 hover:text-ink'}`}>Grid</button>
              <button onClick={() => setView('list')} className={`px-2.5 py-1 rounded-sm text-xs font-medium transition-colors ${view==='list' ? 'bg-surface shadow-sm text-ink' : 'text-ink-3 hover:text-ink'}`}>List</button>
            </div>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        query ? (
          <div className="flex flex-col items-center py-12 text-center rounded-card border border-dashed border-line bg-surface">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
              <Search size={18} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-ink">No matches for “{query}”</p>
            <p className="text-xs text-ink-3 mt-1">Try a different keyword</p>
            <Button variant="outline" size="sm" className="mt-3 h-7 text-xs rounded-full" onClick={() => setQuery('')}>Clear filter</Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center rounded-card border border-dashed border-line bg-surface">
            <div className="w-16 h-16 rounded-card bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-5 shadow-lg">
              <FolderOpen size={28} className="text-white" />
            </div>
            <p className="text-lg font-semibold text-ink">No collections yet</p>
            <p className="text-sm text-ink-3 mt-1 max-w-sm">Organize threads and Sai searches into workspaces. Create your first collection to get started.</p>
            <Button size="sm" className="mt-5" onClick={() => document.querySelector<HTMLInputElement>('input[placeholder^="New collection"]')?.focus()}>
              <Plus size={14} /> Create your first collection
            </Button>
            <div className="flex items-center gap-2 mt-4 text-xs text-ink-3">
              <span className="inline-flex items-center gap-1.5"><FileText size={12}/> Threads</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1.5"><Sparkles size={12}/> Sai searches</span>
              <span>·</span>
              <span>Markdown export</span>
            </div>
          </div>
        )
      ) : view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <div key={c.id} className="group relative flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card hover:shadow-lg hover:border-line-strong transition-all duration-200">
              <div className={`h-2 w-full bg-gradient-to-r ${hashToGradient(c.title)}`} />
              <Link href={`/dashboard/collections/${c.id}`} className="flex-1 p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-control bg-gradient-to-br ${hashToGradient(c.title)} flex items-center justify-center shadow-sm`}>
                    <FolderOpen size={18} className="text-white" />
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-ink-3">
                    <FileText size={12}/> {c._count.items}
                  </span>
                </div>
                <h2 className="font-semibold text-sm text-ink line-clamp-2 leading-snug group-hover:text-brand transition-colors">{c.title}</h2>
                <p className="text-xs text-ink-3 mt-1.5">Updated {new Date(c.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · {c._count.items} items</p>
              </Link>
              <div className="flex items-center justify-between px-4 py-3 border-t border-line bg-canvas/50">
                <span className="text-xs font-medium text-ink-2">{c._count.items === 0 ? 'Empty' : c._count.items === 1 ? '1 item' : `${c._count.items} items`}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild><Link href={`/dashboard/collections/${c.id}/export`}><Download size={14}/></Link></Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-destructive" onClick={() => handleDelete(c.id, c.title)}><Trash2 size={14}/></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <Link key={c.id} href={`/dashboard/collections/${c.id}`} className="group flex items-center gap-4 rounded-card border border-line bg-surface p-4 hover:bg-hover hover:border-line-strong shadow-card transition-colors">
              <div className={`w-10 h-10 rounded-control bg-gradient-to-br ${hashToGradient(c.title)} flex items-center justify-center shrink-0`}>
                <FolderOpen size={18} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-medium text-sm text-ink truncate group-hover:text-brand">{c.title}</h2>
                <p className="text-xs text-ink-3">{c._count.items} items · {new Date(c.updatedAt).toLocaleDateString()}</p>
              </div>
              <span className="text-xs text-ink-3 hidden sm:inline-flex items-center gap-1">{c._count.items} items <MoreHorizontal size={14}/></span>
            </Link>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-ink-3">
        <span>{filtered.length} of {collections.length} collections{query ? ` for “${query}”` : ''}</span>
        <span className="hidden sm:inline">Grid shows cover · List is compact</span>
      </div>
    </div>
  );
}

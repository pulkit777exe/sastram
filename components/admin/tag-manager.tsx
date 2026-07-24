'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, Trash2, Merge, Check, X, Search, AlertTriangle } from 'lucide-react';
import { toasts } from '@/lib/utils/toast';
import { createTagAction, updateTagAction, deleteTagAction, mergeTagsAction } from '@/modules/tags/actions';

interface Tag {
  id: string;
  name: string;
  slug: string;
  color: string;
  threadCount: number;
}

interface TagManagerProps {
  tags: Tag[];
  total: number;
  totalPages: number;
  currentPage: number;
  search: string;
}

export function TagManager({ tags: initialTags, total, totalPages, currentPage, search: initialSearch }: TagManagerProps) {
  const router = useRouter();
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3736fc');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteClosing, setDeleteClosing] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [mergeSource, setMergeSource] = useState('');
  const [mergeTarget, setMergeTarget] = useState('');

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      router.push(`/dashboard/admin/tags?${params.toString()}`);
    },
    [router, searchQuery]
  );

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    const tempId = `temp-${Date.now()}`;
    const slug = newName.trim().toLowerCase().replace(/\s+/g, '-');
    const optimisticTag: Tag = { id: tempId, name: newName.trim(), slug, color: newColor, threadCount: 0 };

    setTags((prev) => [optimisticTag, ...prev]);
    setNewName('');
    setNewColor('#3736fc');
    setShowCreate(false);
    toasts.success('Tag created');

    const res = await createTagAction({ name: newName.trim(), color: newColor });
    if (res.ok && res.data) {
      setTags((prev) => prev.map((t) => t.id === tempId ? { id: res.data!.id, name: newName.trim(), slug: res.data!.slug ?? slug, color: newColor, threadCount: 0 } : t));
    } else {
      setTags((prev) => prev.filter((t) => t.id !== tempId));
      toasts.error(res.error || 'Failed to create tag');
    }
  }, [newName, newColor]);

  const handleUpdate = useCallback(async () => {
    if (!editingId || !editName.trim()) return;
    const prev = tags;
    setTags((p) => p.map((t) => t.id === editingId ? { ...t, name: editName.trim(), color: editColor } : t));
    setEditingId(null);
    toasts.success('Tag updated');

    const res = await updateTagAction({ id: editingId, name: editName.trim(), color: editColor });
    if (!res.ok) {
      setTags(prev);
      toasts.error(res.error || 'Failed to update tag');
    }
  }, [editingId, editName, editColor, tags]);

  const handleDelete = useCallback(async () => {
    if (!deletingId) return;
    const prev = tags;
    const name = tags.find((t) => t.id === deletingId)?.name ?? '';
    setTags((p) => p.filter((t) => t.id !== deletingId));
    setDeletingId(null);
    toasts.success(`Tag "${name}" deleted`);

    const res = await deleteTagAction({ id: deletingId });
    if (!res.ok) {
      setTags(prev);
      toasts.error(res.error || 'Failed to delete tag');
    }
  }, [deletingId, tags]);

  const handleMerge = useCallback(async () => {
    if (!mergeSource || !mergeTarget || mergeSource === mergeTarget) return;
    const prev = tags;
    const source = tags.find((t) => t.id === mergeSource);
    setTags((p) => {
      const target = p.find((t) => t.id === mergeTarget);
      if (!target || !source) return p.filter((t) => t.id !== mergeSource);
      return p
        .filter((t) => t.id !== mergeSource)
        .map((t) => t.id === mergeTarget ? { ...t, threadCount: t.threadCount + source.threadCount } : t);
    });
    setShowMerge(false);
    setMergeSource('');
    setMergeTarget('');
    toasts.success('Tags merged');

    const res = await mergeTagsAction({ sourceId: mergeSource, targetId: mergeTarget });
    if (!res.ok) {
      setTags(prev);
      toasts.error(res.error || 'Failed to merge tags');
    }
  }, [mergeSource, mergeTarget, tags]);

  const tagMap = new Map(tags.map((t) => [t.id, t]));

  return (
    <div className="space-y-6">
      {/* Actions bar */}
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Button type="submit" size="sm" variant="secondary" className="h-9">
            Search
          </Button>
        </form>

        <Button onClick={() => setShowCreate(true)} size="sm" className="h-9">
          <Plus className="w-4 h-4 mr-1.5" />
          New Tag
        </Button>

        <Button onClick={() => setShowMerge(true)} size="sm" variant="outline" className="h-9" disabled={tags.length < 2}>
          <Merge className="w-4 h-4 mr-1.5" />
          Merge Tags
        </Button>
      </div>

      {/* Create tag form */}
      {showCreate && (
        <Card className="border-brand/30 bg-brand/5">
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. artificial-intelligence"
                  className="h-9 text-sm w-56"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="w-9 h-9 rounded-md border border-input bg-transparent cursor-pointer"
                  />
                  <span className="text-xs font-mono text-muted-foreground">{newColor}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button onClick={handleCreate} size="sm" disabled={!newName.trim()} className="h-9">
                  <Check className="w-3.5 h-3.5 mr-1" />
                  Create
                </Button>
                <Button onClick={() => setShowCreate(false)} size="sm" variant="ghost" className="h-9">
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Merge dialog */}
      {showMerge && (
        <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20">
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <Merge className="w-4 h-4 text-amber-600" />
              Merge tags — all threads using the source tag will be reassigned to the target tag.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Source tag</Label>
                <select
                  value={mergeSource}
                  onChange={(e) => setMergeSource(e.target.value)}
                  className="flex h-9 w-48 rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="">Select source...</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      #{t.name} ({t.threadCount})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Target tag</Label>
                <select
                  value={mergeTarget}
                  onChange={(e) => setMergeTarget(e.target.value)}
                  className="flex h-9 w-48 rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="">Select target...</option>
                  {tags
                    .filter((t) => t.id !== mergeSource)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        #{t.name} ({t.threadCount})
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  onClick={handleMerge}
                  size="sm"
                  disabled={!mergeSource || !mergeTarget || mergeSource === mergeTarget}
                  className="h-9"
                >
                  Merge
                </Button>
                <Button onClick={() => setShowMerge(false)} size="sm" variant="ghost" className="h-9">
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tag list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <span>All Tags</span>
            <span className="text-sm font-normal text-muted-foreground">{total} total</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {tags.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <TagsIcon className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground/60">No tags found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                  <tr>
                    <th className="px-4 py-3 font-medium">Color</th>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Slug</th>
                    <th className="px-4 py-3 font-medium text-right">Threads</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tags.map((tag) => (
                    <tr key={tag.id} className="group hover:bg-muted/30 transition-colors">
                      {editingId === tag.id ? (
                        <>
                          <td className="px-4 py-2">
                            <input
                              type="color"
                              value={editColor}
                              onChange={(e) => setEditColor(e.target.value)}
                              className="w-8 h-8 rounded-md border border-input bg-transparent cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="h-8 text-sm w-44"
                              autoFocus
                            />
                          </td>
                          <td className="px-4 py-2 text-muted-foreground font-mono text-xs">
                            {tag.slug}
                          </td>
                          <td className="px-4 py-2 text-right text-muted-foreground">
                            {tag.threadCount}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                onClick={handleUpdate}
                                size="sm"
                                variant="ghost"
                                disabled={!editName.trim()}
                                className="min-h-10 min-w-10 h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                onClick={() => setEditingId(null)}
                                size="sm"
                                variant="ghost"
                                className="min-h-10 min-w-10 h-7 w-7 p-0"
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2.5">
                            <span
                              className="inline-block w-6 h-6 rounded-md border border-border"
                              style={{ backgroundColor: tag.color }}
                            />
                          </td>
                          <td className="px-4 py-2.5 font-medium">
                            <span className="text-xs font-semibold text-muted-foreground mr-1">#</span>
                            {tag.name}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">
                            {tag.slug}
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">
                            {tag.threadCount}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              <Button
                                onClick={() => {
                                  setEditingId(tag.id);
                                  setEditName(tag.name);
                                  setEditColor(tag.color);
                                }}
                                size="sm"
                                variant="ghost"
                                className="min-h-10 min-w-10 h-7 w-7 p-0"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                onClick={() => setDeletingId(tag.id)}
                                size="sm"
                                variant="ghost"
                                className="min-h-10 min-w-10 h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={p === currentPage ? 'default' : 'outline'}
              className="h-8 min-w-8"
              onClick={() => {
                const params = new URLSearchParams();
                if (searchQuery) params.set('search', searchQuery);
                if (p > 1) params.set('page', String(p));
                router.push(`/dashboard/admin/tags?${params.toString()}`);
              }}
            >
              {p}
            </Button>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${deleteClosing ? 'opacity-0' : 'opacity-100'}`}
            onClick={() => {
              setDeleteClosing(true);
              setTimeout(() => { setDeletingId(null); setDeleteClosing(false); }, 150);
            }}
          />
          <Card className={`t-modal ${deleteClosing ? '' : 'is-open'} relative w-full max-w-sm mx-4 z-10`}>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Delete tag?</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    This tag will be removed from{' '}
                    <span className="font-medium">{tagMap.get(deletingId)?.threadCount ?? 0} threads</span>
                    .
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button onClick={() => {
                  setDeleteClosing(true);
                  setTimeout(() => { setDeletingId(null); setDeleteClosing(false); }, 150);
                }} size="sm" variant="outline">
                  Cancel
                </Button>
                <Button onClick={handleDelete} size="sm" variant="destructive">
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function TagsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 5H9l-6 9 6 9h6l6-9-6-9Z" />
      <circle cx="9.5" cy="11.5" r="1.5" />
    </svg>
  );
}

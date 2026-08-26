'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  const [newColor, setNewColor] = useState('#3872E9');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
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
    setNewColor('#3872E9');
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
        <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 min-w-50 max-w-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

        <Button type="button" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          New Tag
        </Button>

        <Button type="button" onClick={() => setShowMerge(true)} disabled={tags.length < 2}>
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
                    className="w-9 h-9 rounded-control border border-input bg-transparent cursor-pointer"
                  />
                  <span className="text-xs font-mono text-muted-foreground">{newColor}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button type="button" onClick={handleCreate} disabled={!newName.trim()}>
                  <Check className="w-3.5 h-3.5 mr-1" />
                  Create
                </Button>
                <Button type="button" onClick={() => setShowCreate(false)} variant="outline" size="icon-sm">
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
                <Select value={mergeSource} onValueChange={setMergeSource}>
                  <SelectTrigger className="w-48 h-9">
                    <SelectValue placeholder="Select source..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tags.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        #{t.name} ({t.threadCount})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Target tag</Label>
                <Select value={mergeTarget} onValueChange={setMergeTarget}>
                  <SelectTrigger className="w-48 h-9">
                    <SelectValue placeholder="Select target..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tags
                      .filter((t) => t.id !== mergeSource)
                      .map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          #{t.name} ({t.threadCount})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1.5">
                <Button type="button"
                  onClick={handleMerge}
                  disabled={!mergeSource || !mergeTarget || mergeSource === mergeTarget}
                >
                  Merge
                </Button>
                <Button type="button" onClick={() => setShowMerge(false)} variant="outline">
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
                    <tr key={tag.id} className="group hover:bg-muted/40 transition-colors">
                      {editingId === tag.id ? (
                        <>
                          <td className="px-4 py-2">
                            <input
                              type="color"
                              value={editColor}
                              onChange={(e) => setEditColor(e.target.value)}
                              className="w-8 h-8 rounded-control border border-input bg-transparent cursor-pointer"
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
                              <Button type="button" variant="ghost" size="icon-sm"
                                onClick={handleUpdate}
                                disabled={!editName.trim()}
                                className="text-green-600 hover:text-green-700 hover:bg-green/10"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                              <Button type="button" variant="ghost" size="icon-sm"
                                onClick={() => setEditingId(null)}
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
                              className="inline-block w-6 h-6 rounded-control border border-line"
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
                              <Button type="button" variant="ghost" size="icon-sm"
                                onClick={() => {
                                  setEditingId(tag.id);
                                  setEditName(tag.name);
                                  setEditColor(tag.color);
                                }}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button type="button" variant="ghost" size="icon-sm"
                                onClick={() => setDeletingId(tag.id)}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
            <Button type="button"
              key={p}
              variant={p === currentPage ? 'default' : 'outline'}
              size="sm"
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
      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Delete tag?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This tag will be removed from{' '}
              <span className="font-medium">{tagMap.get(deletingId ?? '')?.threadCount ?? 0} threads</span>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { TagChip } from './tag-chip';
import { toasts } from '@/lib/utils/toast';
import {
  addTagToThreadAction,
  removeTagFromThreadAction,
  getPopularTagsAction,
} from '@/modules/tags/actions';

export interface ThreadTagItem {
  tag: { id: string; name: string; slug: string };
}

interface PopularTag {
  id: string;
  name: string;
  slug: string;
}

/**
 * Thread tag row — read-only chips for viewers, attach/detach for editors.
 * Fully client-owned state (optimistic + rollback), no page refresh.
 * New-tag creation stays admin-gated server-side, so the picker only offers
 * existing tags.
 */
export function ThreadTagsManager({
  threadId,
  initialTags,
  canEdit,
}: {
  threadId: string;
  initialTags: ThreadTagItem[];
  canEdit: boolean;
}) {
  const [tags, setTags] = useState<ThreadTagItem[]>(initialTags);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [popular, setPopular] = useState<PopularTag[]>([]);
  const [loadingPopular, setLoadingPopular] = useState(false);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close picker on outside click / Escape
  useEffect(() => {
    if (!pickerOpen) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPickerOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  // Load popular tags lazily on first open
  useEffect(() => {
    if (!pickerOpen || popular.length > 0 || loadingPopular) return;
    setLoadingPopular(true);
    void getPopularTagsAction({ limit: 50 }).then((result) => {
      const list = Array.isArray(result.data)
        ? (result.data as PopularTag[]).map((t) => ({ id: t.id, name: t.name, slug: t.slug }))
        : [];
      setPopular(list);
      setLoadingPopular(false);
    });
  }, [pickerOpen, popular.length, loadingPopular]);

  async function attach(tag: PopularTag) {
    if (busyId || tags.some((t) => t.tag.id === tag.id)) return;
    setBusyId(tag.id);
    setTags((prev) => [...prev, { tag: { id: tag.id, name: tag.name, slug: tag.slug } }]);
    const res = await addTagToThreadAction({ threadId, tagId: tag.id });
    setBusyId(null);
    if (res?.error) {
      setTags((prev) => prev.filter((t) => t.tag.id !== tag.id));
      toasts.error(res.error);
      return;
    }
    toasts.success(`Tagged #${tag.name}`);
  }

  async function detach(tagId: string, tagName: string) {
    if (busyId) return;
    const snapshot = tags;
    setBusyId(tagId);
    setTags((prev) => prev.filter((t) => t.tag.id !== tagId));
    const res = await removeTagFromThreadAction({ threadId, tagId });
    setBusyId(null);
    if (res?.error) {
      setTags(snapshot);
      toasts.error(res.error);
      return;
    }
    toasts.success(`Removed #${tagName}`);
  }

  const normalizedQuery = query.trim().toLowerCase();
  const attachedIds = new Set(tags.map((t) => t.tag.id));
  const suggestions = popular
    .filter((t) => !attachedIds.has(t.id))
    .filter((t) => !normalizedQuery || t.name.toLowerCase().includes(normalizedQuery))
    .slice(0, 8);

  if (!canEdit) {
    if (tags.length === 0) return null;
    return (
      <div className="max-w-4xl mx-auto mb-4 flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <TagChip key={t.tag.slug} tag={{ name: t.tag.name, slug: t.tag.slug }} />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto mb-4 flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <TagChip
          key={t.tag.slug}
          tag={{ name: t.tag.name, slug: t.tag.slug }}
          clickable={false}
          onRemove={busyId === t.tag.id ? undefined : () => void detach(t.tag.id, t.tag.name)}
        />
      ))}
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
          aria-haspopup="dialog"
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2.5 py-1 text-xs font-medium text-ink-3 hover:text-ink hover:border-line-strong transition-colors"
        >
          <Plus size={12} /> Tag
        </button>
        {pickerOpen && (
          <div className="absolute left-0 top-full z-20 mt-2 w-64 rounded-card border border-line bg-surface p-2 shadow-overlay">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tags…"
              autoFocus
              className="w-full rounded-control border border-line bg-field px-2 py-1.5 text-xs focus:outline-none focus:border-line-strong mb-1.5"
            />
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {loadingPopular ? (
                <p className="flex items-center gap-2 px-2 py-2 text-xs text-ink-3">
                  <Loader2 size={12} className="animate-spin" /> Loading…
                </p>
              ) : suggestions.length > 0 ? (
                suggestions.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => void attach(t)}
                    disabled={busyId === t.id}
                    className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-xs hover:bg-hover disabled:opacity-50"
                  >
                    {busyId === t.id ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} className="text-ink-3" />}
                    <span className="truncate">#{t.name}</span>
                  </button>
                ))
              ) : (
                <p className="px-2 py-2 text-xs text-ink-3">
                  {normalizedQuery ? `No tags match “${query.trim()}”` : 'No more tags to add'}
                </p>
              )}
            </div>
            <p className="px-2 pt-1.5 text-[11px] text-ink-3">Only existing tags can be attached — new tags are admin-created.</p>
          </div>
        )}
      </div>
    </div>
  );
}

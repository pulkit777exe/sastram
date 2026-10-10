'use client';

// Shared logic for the "Save to collection" dropdowns (CollectionSaveButton
// and BulkSaveButton): collections fetch w/ tab-level cache, outside-click /
// Escape dismissal, and create-and-return-new-collection.
import { useEffect, useRef, useState } from 'react';
import { toasts } from '@/lib/utils/toast';
import { getCollectionsCache, setCollectionsCache, invalidateCollectionsCache } from './collections-cache';

export interface CollectionOption {
  id: string;
  title: string;
}

export function useCollectionsDropdown() {
  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

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
          const data = (j.data ?? []) as CollectionOption[];
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

  // Close on outside click / Escape
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

  /**
   * Create a collection from the inline title input.
   * Returns the created collection id, or null if creation failed
   * (errors are toasted here).
   */
  async function createCollectionFromInput(): Promise<string | null> {
    const title = newTitle.trim();
    if (!title) return null;
    const res = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      if (res.status === 409) {
        toasts.error(j?.error?.message || 'Already exists');
      } else {
        toasts.error(j?.error?.message || 'Create failed');
      }
      return null;
    }
    const j = await res.json();
    const id = j.data?.id as string | undefined;
    if (!id) return null;
    invalidateCollectionsCache();
    setNewTitle('');
    return id;
  }

  return { open, setOpen, collections, loading, newTitle, setNewTitle, containerRef, createCollectionFromInput };
}

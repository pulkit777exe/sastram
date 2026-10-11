'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Trash2, ExternalLink, Search, MessageSquare, FileText, Calendar, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toasts } from '@/lib/utils/toast';
import { toListView } from '@/modules/collections/metadata';

export interface CollectionListItem {
  id: string;
  threadId: string | null;
  sessionId: string | null;
  messageId: string | null;
  metadata: unknown;
  createdAt: Date | string;
  thread?: { id: string; name: string; slug: string; aiSummary?: string | null } | null;
  session?: { id: string; query: string; title: string | null; results: Array<{ synthesis: string }> } | null;
  message?: { id: string; content: string; threadId: string; isAiResponse: boolean; thread?: { name: string; slug: string } | null } | null;
}

/**
 * Client-owned items list — deletes filter local state instantly.
 * No router.refresh(): the server list would re-render the whole page
 * for a single row removal.
 */
export function CollectionItemsList({
  initialItems,
  collectionId,
  hasMore,
}: {
  initialItems: CollectionListItem[];
  collectionId: string;
  hasMore: boolean;
}) {
  const [items, setItems] = useState<CollectionListItem[]>(initialItems);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function remove(itemId: string) {
    if (removingId) return;
    const snapshot = items;
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    setRemovingId(itemId);
    try {
      const res = await fetch(`/api/collections/${collectionId}/items?itemId=${itemId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('remove failed');
      toasts.success('Removed from collection');
    } catch {
      setItems(snapshot);
      toasts.error('Failed to remove');
    } finally {
      setRemovingId(null);
    }
  }

  function itemTypeLabel(item: CollectionListItem): string {
    if (item.thread) return 'Thread';
    if (item.session) return 'Sai search';
    if (item.message) return item.message.isAiResponse ? 'AI response' : 'Message';
    return toListView(item.metadata)?.label ?? 'Item';
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Items — {items.length}{hasMore ? '+' : ''}</h2>
        <span className="text-xs text-ink-3">Sorted by saved date{hasMore ? ' · showing 50, export for all' : ''}</span>
      </div>
      <div className="grid gap-3">
        {items.map((item) => {
          const view = item.thread || item.session || item.message ? null : toListView(item.metadata);
          const iconBg = item.thread ? 'bg-brand/10 text-brand' : item.session ? 'bg-violet-500/10 text-violet-600' : item.message ? (item.message.isAiResponse ? 'bg-emerald-500/10 text-emerald-600' : 'bg-brand/10 text-brand') : view?.label === 'Graph' ? 'bg-amber-500/10 text-amber-600' : view?.label === 'Canvas' ? 'bg-indigo-500/10 text-indigo-600' : 'bg-muted text-ink-3';
          return (
            <div key={item.id} className="group flex items-center gap-4 rounded-card border border-line bg-surface p-4 hover:bg-hover hover:border-line-strong hover:shadow-card transition-all">
              <div className={`w-9 h-9 rounded-control flex items-center justify-center shrink-0 ${iconBg}`}>
                {item.thread ? <MessageSquare size={16} /> : item.session ? <Search size={16} /> : item.message ? <MessageSquare size={16} /> : <FileText size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                {item.thread ? (
                  <Link href={`/dashboard/threads/${item.thread.slug}`} prefetch={false} className="flex items-center gap-1.5 hover:underline decoration-ink/20">
                    <span className="text-sm font-medium text-ink truncate">{item.thread.name}</span>
                    <ExternalLink size={12} className="text-ink-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ) : item.session ? (
                  <Link href={`/dashboard/sai-search?session=${item.session.id}`} prefetch={false} className="flex items-center gap-1.5 hover:underline decoration-ink/20">
                    <span className="text-sm font-medium text-ink truncate">{item.session.title || item.session.query}</span>
                    <ExternalLink size={12} className="text-ink-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ) : item.message ? (
                  <Link href={item.message.thread ? `/dashboard/threads/${item.message.thread.slug}#message-${item.message.id}` : `/dashboard/threads/${item.message.threadId}`} prefetch={false} className="flex items-center gap-1.5 hover:underline decoration-ink/20">
                    <span className="text-sm font-medium text-ink truncate">{item.message.isAiResponse ? 'AI: ' : ''}{item.message.content.slice(0, 80)}{item.message.content.length > 80 ? '…' : ''}</span>
                    <ExternalLink size={12} className="text-ink-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ) : view ? (
                  view.href ? (
                    <Link href={view.href} prefetch={false} className="flex items-center gap-1.5 hover:underline decoration-ink/20">
                      <span className="text-sm font-medium text-ink truncate">{view.title}</span>
                      <ExternalLink size={12} className="text-ink-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-ink truncate">{view.title}</span>
                  )
                ) : (
                  <span className="text-sm text-ink-3">Unknown item</span>
                )}
                <div className="flex items-center gap-2 mt-1 text-xs text-ink-3">
                  <span className="inline-flex items-center gap-1"><Calendar size={12} /> {new Date(item.createdAt).toLocaleDateString()}</span>
                  <span>·</span>
                  <span>{itemTypeLabel(item)}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-ink-3 hover:text-destructive"
                onClick={() => void remove(item.id)}
                disabled={removingId === item.id}
                aria-label="Remove from collection"
              >
                {removingId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

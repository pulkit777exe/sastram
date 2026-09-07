import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/modules/auth';
import { getCollection } from '@/modules/collections/repository';
import { Bookmark, ExternalLink, Search, MessageSquare, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CollectionItemActions } from './collection-item-actions';

export default async function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return <div className="p-8">Please log in</div>;

  const collection = await getCollection(id, session.user.id);
  if (!collection) notFound();

  const items = collection.items ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link href="/dashboard/collections" className="inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink mb-4">
        <ArrowLeft size={12} /> Back to collections
      </Link>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif-heading text-xl flex items-center gap-2">
            <Bookmark size={18} className="text-ink-3" /> {collection.title}
          </h1>
          <p className="text-xs text-ink-3 mt-1">{items.length} item{items.length !== 1 ? 's' : ''} · updated {new Date(collection.updatedAt).toLocaleDateString()}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-card border border-dashed border-line bg-surface">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <Bookmark size={20} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-ink">No items yet</p>
          <p className="text-xs text-ink-3 mt-1 max-w-sm">Save threads via the Save button on any thread, or save Sai search sessions.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/dashboard/threads">Browse threads</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item: { id: string; threadId: string | null; sessionId: string | null; createdAt: Date; thread?: { id: string; name: string; slug: string } | null; session?: { id: string; query: string; title: string | null; results: Array<{ synthesis: string }> } | null }) => (
            <div key={item.id} className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 hover:bg-hover group">
              <div className="flex-1 min-w-0">
                {item.thread ? (
                  <Link href={`/dashboard/threads/${item.thread.slug}`} className="flex items-center gap-2 hover:underline">
                    <MessageSquare size={14} className="text-ink-3 shrink-0" />
                    <span className="text-sm font-medium text-ink truncate">{item.thread.name}</span>
                    <ExternalLink size={12} className="text-ink-3 shrink-0" />
                  </Link>
                ) : item.session ? (
                  <Link href={`/dashboard/sai-search?session=${item.session.id}`} className="flex items-center gap-2 hover:underline">
                    <Search size={14} className="text-ink-3 shrink-0" />
                    <span className="text-sm font-medium text-ink truncate">{item.session.title || item.session.query}</span>
                    <ExternalLink size={12} className="text-ink-3 shrink-0" />
                  </Link>
                ) : (
                  <span className="text-sm text-ink-3">Unknown item</span>
                )}
                <p className="text-xs text-ink-3 mt-0.5">Saved {new Date(item.createdAt).toLocaleDateString()}</p>
              </div>
              <CollectionItemActions itemId={item.id} collectionId={collection.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

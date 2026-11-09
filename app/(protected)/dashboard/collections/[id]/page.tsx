import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/modules/auth';
import { getCollection } from '@/modules/collections/repository';
import { Bookmark, Search, Download, FolderOpen, ArrowLeft, Calendar, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DetailCard } from '@/components/ui/detail-card';
import { CollectionItemsList } from '@/components/collections/CollectionItemsList';
import { ThreadDetailsPanel } from '@/components/thread/thread-details-panel';

export default async function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return <div className="p-8">Please log in</div>;

  const collection = await getCollection(id, session.user.id, { take: 51, viewerRole: session.user.role });
  if (!collection) notFound();

  const rawItems = collection.items ?? [];
  const hasMore = rawItems.length > 50;
  const items = hasMore ? rawItems.slice(0, 50) : rawItems;

  const grad = (() => {
    let h = 0;
    for (let i = 0; i < collection.title.length; i++) h = (h * 31 + collection.title.charCodeAt(i)) >>> 0;
    const gs = ['from-violet-500 via-indigo-500 to-blue-500', 'from-emerald-500 via-teal-500 to-cyan-500', 'from-amber-500 via-orange-500 to-red-500', 'from-pink-500 via-rose-500 to-red-500', 'from-blue-500 via-cyan-500 to-teal-500'];
    return gs[h % gs.length];
  })();

  const updatedDate = new Date(collection.updatedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  const createdDate = collection.createdAt ? new Date(collection.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : updatedDate;

  return (
    <div className="flex h-full w-full overflow-hidden">
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="w-full p-6 sm:p-8">
            <div className={`h-1.5 w-full rounded-full bg-gradient-to-r ${grad} mb-6`} />
            <Link href="/dashboard/collections" className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-3 hover:text-ink mb-6 transition-colors">
              <ArrowLeft size={14} /> Back to collections
            </Link>

            <div className="rounded-card border border-line bg-surface shadow-card overflow-hidden mb-6">
              <div className={`h-24 bg-gradient-to-r ${grad} relative`}>
                <div className="absolute -bottom-6 left-6 w-12 h-12 rounded-card bg-surface border border-line shadow-card flex items-center justify-center">
                  <Bookmark size={20} className="text-ink" />
                </div>
              </div>
              <div className="pt-10 p-6 sm:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h1 className="font-serif-heading text-2xl leading-tight text-ink sm:text-3xl">{collection.title}</h1>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-3">
                      <Badge variant="secondary" className="gap-1.5 px-2.5 py-1">
                        <Layers size={12} />
                        {items.length} {items.length === 1 ? 'item' : 'items'}
                      </Badge>
                      <Badge variant="outline" className="gap-1.5 px-2.5 py-1">
                        <Calendar size={12} />
                        Updated {updatedDate}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <Button variant="outline" size="sm" className="h-8 gap-1.5" asChild>
                      <Link href={`/dashboard/collections/${collection.id}/export`}>
                        <Download size={14} /> Export
                      </Link>
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 gap-1.5" asChild>
                      <Link href="/dashboard/threads">
                        <Search size={14} /> Browse threads
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center rounded-card border border-dashed border-line bg-surface">
                <div className="w-14 h-14 rounded-card bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-4 shadow-md">
                  <FolderOpen size={22} className="text-white" />
                </div>
                <p className="text-base font-semibold text-ink">No items yet</p>
                <p className="text-sm text-ink-3 mt-1 max-w-sm">Save threads via the bookmark on any thread, or save Sai search sessions from the graph.</p>
                <div className="flex gap-2 mt-5">
                  <Button asChild size="sm">
                    <Link href="/dashboard/threads">Browse threads</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard/sai-search">Go to Sai Search</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <CollectionItemsList initialItems={items} collectionId={collection.id} hasMore={hasMore} />
            )}
          </div>
        </div>
      </main>

      <ThreadDetailsPanel>
        <aside className="flex flex-col gap-4 p-5">
          <DetailCard className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-card bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                <Bookmark size={16} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">Collection</p>
                <p className="text-xs text-ink-3">Private workspace</p>
              </div>
            </div>
            <div className="space-y-2 text-xs text-ink-2">
              <div className="flex items-center justify-between">
                <span className="text-ink-3">Items</span>
                <span className="font-medium text-ink">{items.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-3">Created</span>
                <span className="font-medium text-ink">{createdDate}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-3">Last updated</span>
                <span className="font-medium text-ink">{updatedDate}</span>
              </div>
            </div>
          </DetailCard>

          <DetailCard className="space-y-2">
            <p className="text-xs font-medium text-ink">Quick actions</p>
            <div className="flex flex-col gap-1.5">
              <Button variant="ghost" size="sm" className="justify-start h-8 gap-1.5" asChild>
                <Link href={`/dashboard/collections/${collection.id}/export`}>
                  <Download size={14} /> Export collection
                </Link>
              </Button>
              <Button variant="ghost" size="sm" className="justify-start h-8 gap-1.5" asChild>
                <Link href="/dashboard/threads">
                  <Search size={14} /> Browse threads
                </Link>
              </Button>
            </div>
          </DetailCard>
        </aside>
      </ThreadDetailsPanel>
    </div>
  );
}

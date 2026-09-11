import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/modules/auth';
import { getCollection } from '@/modules/collections/repository';
import { Bookmark, ExternalLink, Search, MessageSquare, ArrowLeft, FileText, Download, FolderOpen, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CollectionItemActions } from './collection-item-actions';

export default async function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return <div className="p-8">Please log in</div>;

  const collection = await getCollection(id, session.user.id, { take: 51 });
  if (!collection) notFound();

  const rawItems = collection.items ?? [];
  const hasMore = rawItems.length > 50;
  const items = hasMore ? rawItems.slice(0, 50) : rawItems;

  const grad = (() => { let h=0; for(let i=0;i<collection.title.length;i++) h=(h*31+collection.title.charCodeAt(i))>>>0; const gs=['from-violet-500 via-indigo-500 to-blue-500','from-emerald-500 via-teal-500 to-cyan-500','from-amber-500 via-orange-500 to-red-500','from-pink-500 via-rose-500 to-red-500','from-blue-500 via-cyan-500 to-teal-500']; return gs[h%gs.length]; })();

  return (
    <div className="max-w-4xl mx-auto">
      <div className={`h-1.5 w-full rounded-full bg-gradient-to-r ${grad} mb-6`} />
      <Link href="/dashboard/collections" className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-3 hover:text-ink mb-6 transition-colors">
        <ArrowLeft size={14} /> Back to collections
      </Link>

      <div className="rounded-card border border-line bg-surface shadow-card overflow-hidden mb-6">
        <div className={`h-20 bg-gradient-to-r ${grad} relative`}>
          <div className="absolute -bottom-6 left-6 w-12 h-12 rounded-card bg-surface border border-line shadow-card flex items-center justify-center">
            <Bookmark size={20} className="text-ink" />
          </div>
        </div>
        <div className="pt-8 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-serif-heading text-2xl leading-tight text-ink">{collection.title}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-ink-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-medium"><FileText size={12}/> {items.length} {items.length===1?'item':'items'}</span>
                <span>Updated {new Date(collection.updatedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                <span className="hidden sm:inline">·</span>
                <span className="hidden sm:inline">Private workspace</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button variant="outline" size="sm" className="h-8 gap-1.5" asChild><Link href={`/dashboard/collections/${collection.id}/export`}><Download size={14}/> Export</Link></Button>
              <Button variant="ghost" size="sm" className="h-8" asChild><Link href="/dashboard/threads"><Search size={14}/> Browse</Link></Button>
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
            <Button asChild size="sm"><Link href="/dashboard/threads">Browse threads</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/dashboard/sai-search">Go to Sai Search</Link></Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Items — {items.length}{hasMore ? '+' : ''}</h2>
            <span className="text-xs text-ink-3">Sorted by saved date{hasMore ? ' · showing 50, export for all' : ''}</span>
          </div>
          <div className="grid gap-3">
            {items.map((item: { id: string; threadId: string | null; sessionId: string | null; messageId: string | null; metadata: unknown; createdAt: Date; thread?: { id: string; name: string; slug: string; aiSummary?: string | null } | null; session?: { id: string; query: string; title: string | null; results: Array<{ synthesis: string }> } | null; message?: { id: string; content: string; threadId: string; isAiResponse: boolean; thread?: { name: string; slug: string } | null } | null }) => {
              const meta = item.metadata as Record<string, unknown> | null;
              const metaType = meta?.type as string | undefined;
              const isGraph = metaType === 'graph';
              const isCanvas = metaType === 'canvas';
              const isSummary = metaType === 'summary';
              const isAiSynthesis = metaType === 'ai_synthesis';
              const iconBg = item.thread ? 'bg-brand/10 text-brand' : item.session ? 'bg-violet-500/10 text-violet-600' : item.message ? (item.message.isAiResponse ? 'bg-emerald-500/10 text-emerald-600' : 'bg-brand/10 text-brand') : isGraph ? 'bg-amber-500/10 text-amber-600' : isCanvas ? 'bg-indigo-500/10 text-indigo-600' : 'bg-muted text-ink-3';
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
                  ) : isGraph ? (
                    <span className="text-sm font-medium text-ink truncate">Graph: {(meta?.nodes as unknown[])?.length ?? 0} nodes · {(meta?.links as unknown[])?.length ?? 0} edges</span>
                  ) : isCanvas ? (
                    <span className="text-sm font-medium text-ink truncate">Canvas: {String(meta?.leftName ?? '?')} vs {String(meta?.rightName ?? '?')}</span>
                  ) : isSummary ? (
                    <Link href={String((meta as Record<string,unknown>)?.threadId ? `/dashboard/threads/${String((meta as Record<string,unknown>).threadId)}` : '/dashboard/threads')} className="flex items-center gap-1.5 hover:underline decoration-ink/20">
                      <span className="text-sm font-medium text-ink truncate">Summary: {String((meta as Record<string,string>)?.content?.slice(0,80) ?? 'summary')}</span>
                      <ExternalLink size={12} className="text-ink-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  ) : isAiSynthesis ? (
                    <span className="text-sm font-medium text-ink truncate">AI Synthesis: {String((meta as Record<string,string>)?.text?.slice(0,80) ?? 'synthesis')}</span>
                  ) : meta ? (
                    <span className="text-sm font-medium text-ink truncate">{String((meta as Record<string,string>)?.title ?? metaType ?? 'Saved item')}</span>
                  ) : (
                    <span className="text-sm text-ink-3">Unknown item</span>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-xs text-ink-3">
                    <span className="inline-flex items-center gap-1"><Calendar size={12}/> {new Date(item.createdAt).toLocaleDateString()}</span>
                    <span>·</span>
                    <span>{item.thread ? 'Thread' : item.session ? 'Sai search' : item.message ? (item.message.isAiResponse ? 'AI response' : 'Message') : isGraph ? 'Graph' : isCanvas ? 'Canvas' : isSummary ? 'Summary' : isAiSynthesis ? 'Synthesis' : 'Item'}</span>
                  </div>
                </div>
                <CollectionItemActions itemId={item.id} collectionId={collection.id} />
              </div>
            )})}
          </div>
        </div>
      )}
    </div>
  );
}

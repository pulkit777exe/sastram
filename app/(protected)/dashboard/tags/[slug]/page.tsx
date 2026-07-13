import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Hash } from 'lucide-react';
import { getSession } from '@/modules/auth';
import { getTagBySlug, getThreadsByTag } from '@/modules/tags';
import { TopicGrid } from '@/components/dashboard/topic-grid';

export default async function TagDetailPage({ params }: { params: { slug: string } }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) return null;

  const tag = await getTagBySlug(slug);
  if (!tag) notFound();

  const threads = await getThreadsByTag(tag.id);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="rounded-4xl border border-border admin-header-gradient p-8 text-white shadow-linear-xl">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white transition-colors mb-4"
        >
          <ArrowLeft size={14} />
          Back to Dashboard
        </Link>
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
          >
            <Hash size={20} />
          </div>
          <div>
            <h1 className="text-3xl font-semibold">#{tag.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{tag.threadCount} thread{tag.threadCount !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </header>

      {threads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Hash size={48} className="text-muted-foreground mb-4" />
          <p className="text-lg font-semibold text-foreground">No threads with this tag</p>
          <p className="text-sm text-muted-foreground mt-1">
            Threads tagged with #{tag.name} will appear here.
          </p>
        </div>
      ) : (
        <TopicGrid topics={threads} />
      )}
    </div>
  );
}

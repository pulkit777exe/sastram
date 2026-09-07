import { getUserCollections } from '@/modules/collections/repository';
import { getSession } from '@/modules/auth';
import Link from 'next/link';
import { Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default async function CollectionsPage() {
  const session = await getSession();
  if (!session) return <div className="p-8">Please log in</div>;
  const collections = await getUserCollections(session.user.id);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="font-serif-heading text-xl mb-4">Collections</h1>
      {collections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-line rounded-card bg-surface">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <Bookmark size={24} className="text-muted-foreground" />
          </div>
          <p className="text-lg font-semibold text-ink">No collections yet</p>
          <p className="text-sm text-ink-3 mt-1 max-w-sm">Save threads or Sai searches to a workspace to find them later.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/dashboard/threads">Browse threads</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {collections.map((c: { id: string; title: string; _count: { items: number }; updatedAt: Date }) => (
            <Link key={c.id} href={`/dashboard/collections/${c.id}`} className="rounded-card border border-line bg-surface p-4 hover:bg-hover">
              <h2 className="font-medium text-sm">{c.title}</h2>
              <p className="text-xs text-ink-3">{c._count.items} items · updated {new Date(c.updatedAt).toLocaleDateString()}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

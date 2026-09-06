import { getUserCollections } from '@/modules/collections/repository';
import { getSession } from '@/modules/auth';
import Link from 'next/link';

export default async function CollectionsPage() {
  const session = await getSession();
  if (!session) return <div className="p-8">Please log in</div>;
  const collections = await getUserCollections(session.user.id);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="font-serif-heading text-xl mb-4">Collections</h1>
      {collections.length === 0 ? (
        <p className="text-sm text-ink-3">No collections yet. Save threads or searches to a workspace.</p>
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

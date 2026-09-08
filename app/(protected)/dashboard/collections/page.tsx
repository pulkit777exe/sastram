import { getUserCollections } from '@/modules/collections/repository';
import { getSession } from '@/modules/auth';
import { CollectionsClient } from '@/components/collections/CollectionsClient';

export default async function CollectionsPage() {
  const session = await getSession();
  if (!session) return <div className="p-8">Please log in</div>;
  const collections = await getUserCollections(session.user.id);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="font-serif-heading text-xl mb-1">Collections</h1>
      <p className="text-xs text-ink-3 mb-4">Workspaces for threads & Sai searches — create inline, filter instantly, typo-tolerant.</p>
      <CollectionsClient initial={collections as unknown as { id: string; title: string; _count: { items: number }; updatedAt: Date }[]} />
    </div>
  );
}

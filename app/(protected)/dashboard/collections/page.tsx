import { getUserCollections } from '@/modules/collections/repository';
import { getSession } from '@/modules/auth';
import { CollectionsClient } from '@/components/collections/CollectionsClient';
import { prisma } from '@/lib/infrastructure/prisma';
import { parseUserPreferences } from '@/lib/schemas/user-preferences';
import Link from 'next/link';
import { FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default async function CollectionsPage() {
  const session = await getSession();
  if (!session) return <div className="p-8">Please log in</div>;

  // Preferences gating outside try — best-effort, never throw (Hobby-safe)
  let collectionsEnabled = true;
  try {
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { preferences: true } });
    const prefs = parseUserPreferences((user?.preferences as unknown) ?? {});
    collectionsEnabled = (prefs as unknown as { collectionsEnabled?: boolean }).collectionsEnabled !== false;
  } catch {
    collectionsEnabled = true;
  }
  if (!collectionsEnabled) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="font-serif-heading text-xl mb-1">Collections</h1>
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-card border border-dashed border-line bg-surface mt-6">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <FolderOpen size={22} className="text-muted-foreground" />
          </div>
          <p className="text-lg font-semibold text-ink">Collections disabled</p>
          <p className="text-sm text-ink-3 mt-1 max-w-sm">Enable it in Settings → Preferences → Collections.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/dashboard/settings">Open settings</Link>
          </Button>
        </div>
      </div>
    );
  }

  const collections = await getUserCollections(session.user.id).catch(() => []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="font-serif-heading text-xl mb-1">Collections</h1>
      <p className="text-xs text-ink-3 mb-4">Workspaces for threads & Sai searches — create inline, filter instantly, typo-tolerant.</p>
      <CollectionsClient initial={collections as unknown as { id: string; title: string; _count: { items: number }; updatedAt: Date }[]} />
    </div>
  );
}

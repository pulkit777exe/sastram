'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toasts } from '@/lib/utils/toast';
import { useRouter } from 'next/navigation';

export function CollectionItemActions({ itemId, collectionId }: { itemId: string; collectionId: string }) {
  const [removing, setRemoving] = useState(false);
  const router = useRouter();

  async function remove() {
    setRemoving(true);
    try {
      const res = await fetch(`/api/collections/${collectionId}/items?itemId=${itemId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('remove failed');
      toasts.success('Removed from collection');
      router.refresh();
    } catch {
      toasts.error('Failed to remove');
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-ink-3 hover:text-destructive" onClick={remove} disabled={removing} aria-label="Remove from collection">
      <Trash2 size={14} />
    </Button>
  );
}

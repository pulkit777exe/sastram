'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { toasts } from '@/lib/utils/toast';
import { Trophy, Loader2 } from 'lucide-react';

export function BountyButton({ threadId }: { threadId: string }) {
  const [total, setTotal] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [adding, setAdding] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/bounties?threadId=${threadId}`);
      if (!res.ok) throw new Error('fetch failed');
      const json = await res.json();
      setTotal(json.data?.total ?? 0);
    } catch {
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const addBounty = async () => {
    const raw = window.prompt('Bounty amount (1-1000)?', '10');
    if (!raw) return;
    const amount = parseInt(raw, 10);
    if (Number.isNaN(amount) || amount < 1 || amount > 1000) {
      toasts.error('Amount must be 1-1000');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/bounties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, amount }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || 'Failed to add bounty');
      toasts.success(`Bounty +${amount} added`);
      await load();
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : 'Failed to add bounty');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Button variant="ghost" size="sm" onClick={addBounty} disabled={adding || loading} className="h-7 px-2 text-xs gap-1.5" aria-label="Add bounty">
      {adding ? <Loader2 size={12} className="animate-spin" /> : <Trophy size={12} />}
      {loading ? '…' : total ? `${total} bounty` : 'Bounty'}
    </Button>
  );
}

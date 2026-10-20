'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toasts } from '@/lib/utils/toast';
import { Trophy, Loader2 } from 'lucide-react';

export function BountyButton({ threadId, iconOnly = false }: { threadId: string; iconOnly?: boolean }) {
  const [total, setTotal] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [adding, setAdding] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState('10');

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
    if (adding || loading) return;
    const value = Number.parseInt(amount, 10);
    if (Number.isNaN(value) || value < 1 || value > 1000) {
      toasts.error('Amount must be 1-1000');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/bounties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, amount: value }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || 'Failed to add bounty');
      toasts.success(`Bounty +${value} added`);
      setOpen(false);
      setAmount('10');
      await load();
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : 'Failed to add bounty');
    } finally {
      setAdding(false);
    }
  };

  const tooltip = total ? `Add bounty · ${total} current` : 'Add bounty';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size={iconOnly ? 'icon' : 'sm'}
              className={
                iconOnly
                  ? 'size-8 shrink-0 p-0 text-ink-3 hover:text-ink hover:bg-hover'
                  : 'h-7 px-2 text-xs gap-1.5'
              }
              aria-label={tooltip}
              aria-busy={adding || loading}
            >
              {adding || loading ? <Loader2 size={iconOnly ? 15 : 12} className="animate-spin" /> : <Trophy size={iconOnly ? 15 : 12} />}
              {!iconOnly && (loading ? '…' : total ? `${total} bounty` : 'Bounty')}
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {tooltip}
        </TooltipContent>
      </Tooltip>

      <DialogContent className="sm:max-w-xs rounded-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy size={16} /> Add bounty
          </DialogTitle>
          <DialogDescription className="text-xs">
            Put points behind this thread so it gets more attention.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="bounty-amount" className="text-xs">
            Amount (1-1000)
          </Label>
          <Input
            id="bounty-amount"
            type="number"
            min={1}
            max={1000}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void addBounty();
            }}
            className="h-9"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => void addBounty()} disabled={adding}>
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Trophy size={14} />}
            Add bounty
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

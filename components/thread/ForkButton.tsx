'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toasts } from '@/lib/utils/toast';
import { GitFork, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function ForkButton({ threadId, threadName }: { threadId: string; threadName: string }) {
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState(`${threadName} (fork)`);
  const [visibility, setVisibility] = React.useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [count, setCount] = React.useState<number | null>(null);
  const router = useRouter();

  React.useEffect(() => {
    if (open) setTitle(`${threadName} (fork)`);
  }, [open, threadName]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/threads/${threadId}/fork`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setCount(json.data?.forks?.length ?? 0);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  const handleFork = async () => {
    if (title.trim().length < 3) {
      toasts.error('Title must be at least 3 characters');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/threads/${threadId}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), visibility }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || 'Fork failed');
      const slug = json?.data?.slug;
      toasts.success(`Forked as ${visibility === 'PRIVATE' ? 'private' : 'public'} thread`);
      setOpen(false);
      if (slug) router.push(`/dashboard/threads/${slug}`);
      else router.refresh();
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : 'Fork failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1.5" aria-label="Fork thread">
          <GitFork size={12} />
          Fork{count != null && count > 0 ? ` ${count}` : ''}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md rounded-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><GitFork size={16}/> Fork thread</DialogTitle>
          <DialogDescription className="text-xs">Create a copy of “{threadName}” — like Reddit crosspost or GitHub fork. Edit title and visibility.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="fork-title" className="text-xs">Title</Label>
            <Input id="fork-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New thread title" className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Visibility</Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as 'PUBLIC' | 'PRIVATE')}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PUBLIC">Public — anyone can see</SelectItem>
                <SelectItem value="PRIVATE">Private — only you</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-ink-3">Public forks appear in threads list; private are hidden like drafts.</p>
          </div>
          <Button onClick={handleFork} disabled={loading || title.trim().length < 3} className="w-full h-8 gap-1.5">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <GitFork size={14} />} Create fork
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

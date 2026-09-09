'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toasts } from '@/lib/utils/toast';
import { GitFork, Loader2, ExternalLink, Link2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function ForkFromUrlButton() {
  const [open, setOpen] = React.useState(false);
  const [url, setUrl] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [visibility, setVisibility] = React.useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  const handleFork = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      toasts.error('Paste a URL from Reddit, HN, StackOverflow, etc.');
      return;
    }
    try {
      new URL(trimmedUrl);
    } catch {
      toasts.error('Invalid URL — must be http/https');
      return;
    }
    if (title.trim() && title.trim().length < 3) {
      toasts.error('Title must be at least 3 characters');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/threads/fork-external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmedUrl, title: title.trim() || undefined, visibility }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || 'Failed to fork from URL');
      const slug = json?.data?.slug;
      toasts.success('Forked from external URL — @sai is summarizing');
      setOpen(false);
      setUrl('');
      setTitle('');
      if (slug) router.push(`/dashboard/threads/${slug}`);
      else router.refresh();
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : 'Failed to fork');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <ExternalLink size={14} />
          Fork from URL
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md rounded-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 size={16}/> Fork from external</DialogTitle>
          <DialogDescription className="text-xs">Paste a Reddit, HN, StackOverflow or any public URL. We’ll create a thread and @sai will summarize it — like crossposting.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="fork-url" className="text-xs">Source URL *</Label>
            <Input id="fork-url" placeholder="https://www.reddit.com/r/nextjs/comments/... or https://news.ycombinator.com/item?id=..." value={url} onChange={(e) => setUrl(e.target.value)} className="h-9 text-sm" />
            <p className="text-xs text-ink-3">Must be public http/https — private IPs are blocked.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fork-external-title" className="text-xs">Title (optional — auto from URL)</Label>
            <Input id="fork-external-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Leave blank to auto-generate" className="h-8 text-sm" />
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
          </div>
          <Button onClick={handleFork} disabled={loading || !url.trim()} className="w-full h-9 gap-1.5">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <GitFork size={14} />} Fork from URL
          </Button>
          <p className="text-xs text-center text-ink-3">Creates a thread with “Forked from {`{url}` }” + @sai summary. Tags are kept from the fork flow.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

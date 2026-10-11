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
import { ROUTES } from '@/lib/config/routes';
import { forkThreadAction } from '@/modules/threads/actions';

type Visibility = 'PUBLIC' | 'PRIVATE';

function VisibilityField({ visibility, onChange }: { visibility: Visibility; onChange: (v: Visibility) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Visibility</Label>
      <Select value={visibility} onValueChange={(v) => onChange(v as Visibility)}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="PUBLIC">Public — anyone can see</SelectItem>
          <SelectItem value="PRIVATE">Private — only you</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Shared fork submit flow: POST to the endpoint, toast, navigate to the new
 * thread. Used by both the in-thread fork and the external-URL fork.
 */
function useForkSubmit(endpoint: string) {
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  async function submit(body: Record<string, unknown>, successMessage: string): Promise<boolean> {
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || 'Fork failed');
      const slug = json?.data?.slug;
      toasts.success(successMessage);
      // Always navigate — the fork exists server-side even if the response
      // shape surprises us, and a router.refresh() fallback just left the
      // user staring at the old page.
      router.push(slug ? ROUTES.THREAD(slug) : ROUTES.DASHBOARD_THREADS);
      return true;
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : 'Fork failed');
      return false;
    } finally {
      setLoading(false);
    }
  }

  return { loading, submit };
}

/** Fork an existing thread — shows the fork count in the trigger. */
export function ForkButton({ threadId, threadName }: { threadId: string; threadName: string }) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState(`${threadName} (fork)`);
  const [visibility, setVisibility] = React.useState<Visibility>('PUBLIC');
  const [count, setCount] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(false);
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
      const result = await forkThreadAction({ threadId, title: title.trim(), visibility });
      if (!result.ok || !result.data) {
        throw new Error(result.error || 'Fork failed');
      }
      const slug = (result.data as { slug?: string }).slug;
      toasts.success(`Forked as ${visibility === 'PRIVATE' ? 'private' : 'public'} thread`);
      setOpen(false);
      router.push(slug ? ROUTES.THREAD(slug) : ROUTES.DASHBOARD_THREADS);
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
          <VisibilityField visibility={visibility} onChange={setVisibility} />
          <p className="text-xs text-ink-3">Public forks appear in threads list; private are hidden like drafts.</p>
          <Button onClick={handleFork} disabled={loading || title.trim().length < 3} className="w-full h-8 gap-1.5">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <GitFork size={14} />} Create fork
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Fork an external URL (Reddit, HN, …) into a new thread. */
export function ForkFromUrlButton() {
  const [open, setOpen] = React.useState(false);
  const [url, setUrl] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [visibility, setVisibility] = React.useState<Visibility>('PUBLIC');
  const { loading, submit } = useForkSubmit('/api/threads/fork-external');

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
    const ok = await submit(
      { url: trimmedUrl, title: title.trim() || undefined, visibility },
      'Forked from external URL — @sai is summarizing'
    );
    if (ok) {
      setOpen(false);
      setUrl('');
      setTitle('');
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
          <VisibilityField visibility={visibility} onChange={setVisibility} />
          <Button onClick={handleFork} disabled={loading || !url.trim()} className="w-full h-9 gap-1.5">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <GitFork size={14} />} Fork from URL
          </Button>
          <p className="text-xs text-center text-ink-3">Creates a thread with “Forked from {`{url}` }” + @sai summary. Tags are kept from the fork flow.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toasts } from '@/lib/utils/toast';
import { GitFork, Loader2, ExternalLink, Link2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ROUTES } from '@/lib/config/routes';
import { forkThreadAction } from '@/modules/threads/actions';

type Visibility = 'PUBLIC' | 'PRIVATE' | 'RESTRICTED';
type ForkKind = 'ASSUMPTION' | 'CONTINUE' | 'REMIX_AI';
type CarryOverMode = 'SUMMARY' | 'NONE';

function VisibilityField({ visibility, onChange }: { visibility: Visibility; onChange: (v: Visibility) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Visibility</Label>
      <Select value={visibility} onValueChange={(v) => onChange(v as Visibility)}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="PUBLIC">Public — anyone can see</SelectItem>
          <SelectItem value="RESTRICTED">Restricted — invited access</SelectItem>
          <SelectItem value="PRIVATE">Private — only you</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-ink-3">Visibility never widens beyond the source thread.</p>
    </div>
  );
}

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

export function ForkButton({
  threadId,
  threadName,
  iconOnly = false,
}: {
  threadId: string;
  threadName: string;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState(`${threadName} (fork)`);
  const [visibility, setVisibility] = React.useState<Visibility>('PUBLIC');
  const [forkKind, setForkKind] = React.useState<ForkKind>('CONTINUE');
  const [premise, setPremise] = React.useState('');
  const [carryOverMode, setCarryOverMode] = React.useState<CarryOverMode>('SUMMARY');
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
      const result = await forkThreadAction({
        threadId,
        title: title.trim(),
        visibility,
        forkKind,
        premise: premise.trim() || undefined,
        carryOverMode,
      });
      if (!result.ok || !result.data) {
        throw new Error(result.error || 'Fork failed');
      }
      const slug = (result.data as { slug?: string }).slug;
      toasts.success('Fork created');
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
              aria-label="Fork thread"
            >
              <GitFork size={iconOnly ? 15 : 12} />
              {!iconOnly && <span>Fork{count != null && count > 0 ? ` ${count}` : ''}</span>}
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {count != null && count > 0 ? `Fork thread · ${count} forks` : 'Fork thread'}
        </TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-lg rounded-card max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><GitFork size={16}/> Fork thread</DialogTitle>
          <DialogDescription className="text-xs">Create a new discussion linked to “{threadName}”. Choose intent, carry-over, and visibility.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Fork intent</Label>
            <Select value={forkKind} onValueChange={(v) => setForkKind(v as ForkKind)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CONTINUE">Continue — extend or revive discussion</SelectItem>
                <SelectItem value="ASSUMPTION">Change assumption — test a different premise</SelectItem>
                <SelectItem value="REMIX_AI">Remix AI — edit claims/sources and re-run later</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fork-title" className="text-xs">Title</Label>
            <Input id="fork-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New thread title" className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fork-premise" className="text-xs">Why / premise (optional, recommended)</Label>
            <Textarea id="fork-premise" value={premise} onChange={(e) => setPremise(e.target.value)} placeholder="What assumption are you changing or why continue/remix?" className="text-sm min-h-[72px]" maxLength={500} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Carry-over</Label>
            <Select value={carryOverMode} onValueChange={(v) => setCarryOverMode(v as CarryOverMode)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SUMMARY">AI summary snapshot (default)</SelectItem>
                <SelectItem value="NONE">Nothing — start fresh</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-ink-3">Carry-over is a snapshot at fork time; only accessible content is copied.</p>
          </div>
          <VisibilityField visibility={visibility} onChange={setVisibility} />
          <Button onClick={handleFork} disabled={loading || title.trim().length < 3} className="w-full h-8 gap-1.5">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <GitFork size={14} />} Create fork
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ForkFromUrlButton() {
  const [open, setOpen] = React.useState(false);
  const [url, setUrl] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [excerpt, setExcerpt] = React.useState('');
  const [attribution, setAttribution] = React.useState('');
  const [premise, setPremise] = React.useState('');
  const [visibility, setVisibility] = React.useState<Visibility>('PUBLIC');
  const { loading, submit } = useForkSubmit('/api/threads/fork-external');

  const handleFork = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      toasts.error('Paste a public URL');
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
      {
        url: trimmedUrl,
        title: title.trim() || undefined,
        excerpt: excerpt.trim() || undefined,
        attribution: attribution.trim() || undefined,
        premise: premise.trim() || undefined,
        visibility,
      },
      'External fork created'
    );
    if (ok) {
      setOpen(false);
      setUrl('');
      setTitle('');
      setExcerpt('');
      setAttribution('');
      setPremise('');
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
      <DialogContent className="sm:max-w-lg rounded-card max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 size={16}/> Fork from external</DialogTitle>
          <DialogDescription className="text-xs">Import a user-provided public link as a new discussion seed. Title, short excerpt, source link, and attribution only — no full mirroring.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="fork-url" className="text-xs">Source URL *</Label>
            <Input id="fork-url" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} className="h-9 text-sm" />
            <p className="text-xs text-ink-3">Must be a safe public http/https URL (SSRF-protected).</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fork-external-title" className="text-xs">Title (optional — auto from URL)</Label>
            <Input id="fork-external-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Leave blank to auto-generate" className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fork-excerpt" className="text-xs">Short excerpt (optional, user-provided)</Label>
            <Textarea id="fork-excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="Paste a short excerpt (max 500 chars). Do not paste full third-party content." className="text-sm min-h-[72px]" maxLength={500} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fork-attribution" className="text-xs">Attribution (optional)</Label>
            <Input id="fork-attribution" value={attribution} onChange={(e) => setAttribution(e.target.value)} placeholder="e.g. Author or source label" className="h-8 text-sm" maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fork-ext-premise" className="text-xs">Why / premise (optional)</Label>
            <Textarea id="fork-ext-premise" value={premise} onChange={(e) => setPremise(e.target.value)} placeholder="Why import this source?" className="text-sm min-h-[60px]" maxLength={500} />
          </div>
          <VisibilityField visibility={visibility} onChange={setVisibility} />
          <Button onClick={handleFork} disabled={loading || !url.trim()} className="w-full h-9 gap-1.5">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <GitFork size={14} />} Fork from URL
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

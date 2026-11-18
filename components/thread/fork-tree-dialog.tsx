'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Network } from 'lucide-react';

const ForceGraphCanvas = dynamic(() => import('@/components/graph/ForceGraphCanvas').then(m => m.ForceGraphCanvas), { ssr: false });

type Node = { id: string; name: string; slug: string };
type Link = { id: string; source: string; target: string; similarity: number };

export function ForkTreeDialog({ threadId }: { threadId: string }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [nodes, setNodes] = React.useState<Node[]>([]);
  const [links, setLinks] = React.useState<Link[]>([]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/threads/${threadId}/fork/tree`);
        const json = await res.json().catch(() => ({}));
        if (!cancelled) {
          setNodes(json.data?.nodes ?? []);
          setLinks(json.data?.links ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, threadId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1.5"><Network size={12}/> Fork tree</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl rounded-card">
        <DialogHeader>
          <DialogTitle>Fork tree</DialogTitle>
        </DialogHeader>
        {loading ? <p className="text-sm text-ink-3">Loading fork lineage…</p> : nodes.length ? <ForceGraphCanvas nodes={nodes} links={links} /> : <p className="text-sm text-ink-3">No fork lineage to display.</p>}
      </DialogContent>
    </Dialog>
  );
}

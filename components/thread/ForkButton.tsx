'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { toasts } from '@/lib/utils/toast';
import { GitFork, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function ForkButton({ threadId, threadName }: { threadId: string; threadName: string }) {
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  const handleFork = async () => {
    const title = window.prompt(`Fork "${threadName}" — new title?`, `${threadName} (fork)`);
    if (title === null) return;
    if (title.trim().length < 3) {
      toasts.error('Title must be at least 3 characters');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/threads/${threadId}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || 'Fork failed');
      const slug = json?.data?.slug;
      toasts.success('Thread forked');
      if (slug) router.push(`/dashboard/threads/${slug}`);
      else router.refresh();
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : 'Fork failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleFork} disabled={loading} className="h-7 px-2 text-xs gap-1.5" aria-label="Fork thread">
      {loading ? <Loader2 size={12} className="animate-spin" /> : <GitFork size={12} />}
      Fork
    </Button>
  );
}

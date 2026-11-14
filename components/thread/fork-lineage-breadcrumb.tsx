'use client';

import React from 'react';
import Link from 'next/link';
import { GitFork } from 'lucide-react';

export function ForkLineageBreadcrumb({ threadId }: { threadId: string }) {
  const [data, setData] = React.useState<{ forkedFrom: { slug: string; name: string; createdBy?: string | null } | null } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/threads/${threadId}/fork`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData({ forkedFrom: json.data?.forkedFrom ?? null });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [threadId]);

  if (!data?.forkedFrom) return null;
  return (
    <div className="px-4 pt-3 pb-0 text-xs text-ink-3 flex items-center gap-1.5">
      <GitFork size={12} />
      <span>Forked from</span>
      <Link href={`/dashboard/threads/${data.forkedFrom.slug}`} className="text-ink-2 hover:text-brand underline-offset-2 hover:underline">
        {data.forkedFrom.name}
      </Link>
    </div>
  );
}

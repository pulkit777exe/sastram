import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ROUTES } from '@/lib/config/routes';
import { ThreadSubscribeButton } from '@/components/thread/subscribe-button';
import { InviteFriendButton } from '@/components/thread/invite-friend-button';

interface ThreadPageHeaderProps {
  title: string;
  threadId: string;
  slug: string;
  initialFrequency: 'DAILY' | 'WEEKLY' | 'NEVER' | null;
}

export function ThreadPageHeader({
  title,
  threadId,
  slug,
  initialFrequency,
}: ThreadPageHeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 sm:px-6 h-14 border-b border-line/60 shrink-0 bg-surface/95 backdrop-blur z-30">
      <div className="flex items-center gap-2 min-w-0">
        <Link
          href={ROUTES.DASHBOARD_THREADS}
          aria-label="Back to threads"
          className="shrink-0 w-8 h-8 -ml-1 rounded-control flex items-center justify-center text-ink-3 hover:text-ink hover:bg-hover transition-colors"
        >
          <ArrowLeft size={16} strokeWidth={2.25} />
        </Link>
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-sai-green animate-pulse shrink-0" />
          <span className="text-sm font-semibold text-ink tracking-tight truncate">{title}</span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <ThreadSubscribeButton
          threadId={threadId}
          slug={slug}
          initialFrequency={initialFrequency}
          threadName={title}
          iconOnly
        />
        <InviteFriendButton threadId={threadId} threadName={title} iconOnly />
      </div>
    </header>
  );
}

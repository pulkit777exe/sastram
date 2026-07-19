import React from 'react';
import Link from 'next/link';
import { Hash, ArrowLeft } from 'lucide-react';
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
    <header className="flex items-center justify-between px-4 sm:px-6 h-[64px] border-b border-border/60 flex-shrink-0 bg-background/95 backdrop-blur z-30">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <Link
          href={ROUTES.DASHBOARD_THREADS}
          aria-label="Back to threads"
          className="shrink-0 w-9 h-9 -ml-1 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          <ArrowLeft size={18} strokeWidth={2.25} />
        </Link>
        <div className="w-[34px] h-[34px] rounded-lg bg-brand/10 dark:bg-brand/20 flex items-center justify-center text-brand dark:text-brand border border-brand/15 dark:border-brand/25 shrink-0">
          <Hash size={16} strokeWidth={2.5} />
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-semibold text-foreground tracking-tight truncate">{title}</span>
          <LiveBadge />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="h-8 min-w-[140px]">
          <ThreadSubscribeButton
            threadId={threadId}
            slug={slug}
            initialFrequency={initialFrequency}
            threadName={title}
          />
        </div>

        <InviteFriendButton threadId={threadId} threadName={title} />
      </div>
    </header>
  );
}

function LiveBadge() {
  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-emerald-200/80 bg-emerald-50/50 w-fit">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Live</span>
    </div>
  );
}

function HeaderBtn({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/60 hover:bg-muted/30 text-xs font-semibold text-muted-foreground transition-all cursor-default select-none h-9">
      {icon}
      <span>{label}</span>
    </div>
  );
}

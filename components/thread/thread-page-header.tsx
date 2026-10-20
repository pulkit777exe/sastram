'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ROUTES } from '@/lib/config/routes';
import { ThreadSubscribeButton } from '@/components/thread/subscribe-button';
import { InviteFriendButton } from '@/components/thread/invite-friend-button';
import { BountyButton } from '@/components/thread/BountyButton';
import { ForkButton } from '@/components/thread/fork-button';
import { CollectionSaveButton } from '@/components/collections/CollectionSaveButton';
import { BookmarkButton } from '@/components/thread/bookmark-button';
import { EditThreadDialog } from '@/components/thread/edit-thread-dialog';

interface ThreadPageHeaderProps {
  title: string;
  threadId: string;
  slug: string;
  initialFrequency: 'DAILY' | 'WEEKLY' | 'NEVER' | null;
  description?: string | null;
  /** OP/moderators get the edit affordance. */
  canEdit?: boolean;
  /** Fired after a successful edit so the wrapper can update in place. */
  onEdited?: (title: string, description: string | null) => void;
  /** Server-known bookmark state for the header bookmark button. */
  isBookmarked?: boolean;
}

export function ThreadPageHeader({
  title,
  threadId,
  slug,
  initialFrequency,
  description,
  canEdit,
  onEdited,
  isBookmarked,
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
          {canEdit && onEdited && (
            <EditThreadDialog
              threadId={threadId}
              initialTitle={title}
              initialDescription={description}
              onSaved={onEdited}
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-0.5">
        <CollectionSaveButton threadId={threadId} iconOnly />
        <BookmarkButton threadId={threadId} iconOnly initialIsBookmarked={isBookmarked} />
        <BountyButton threadId={threadId} iconOnly />
        <ForkButton threadId={threadId} threadName={title} iconOnly />
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

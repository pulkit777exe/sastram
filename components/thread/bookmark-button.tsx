'use client';

import { useState, useEffect } from 'react';
import { Bookmark, BookmarkCheck, Loader2 } from 'lucide-react';
import { setBookmarkStatus, checkBookmarkStatus } from '@/modules/bookmarks/actions';
import { toasts } from '@/lib/utils/toast';
import { cn } from '@/lib/utils/cn';
import { AnimatedIcon } from '@/components/ui/animated-icon';
import { Button } from '@/components/ui/button';

interface BookmarkButtonProps {
  threadId: string;
  className?: string;
  /** Header mode: icon-only, no label. */
  iconOnly?: boolean;
  /**
   * Known status from the server-rendered page. When provided, the button
   * skips the mount-time status round-trip.
   */
  initialIsBookmarked?: boolean;
}

export function BookmarkButton({ threadId, className, iconOnly = false, initialIsBookmarked }: BookmarkButtonProps) {
  const [isBookmarked, setIsBookmarked] = useState(initialIsBookmarked ?? false);
  const [isLoading, setIsLoading] = useState(initialIsBookmarked === undefined);

  useEffect(() => {
    if (initialIsBookmarked !== undefined) return;
    let cancelled = false;
    async function checkStatus() {
      try {
        const result = await checkBookmarkStatus({ threadId });
        if (cancelled) return;
        if (result?.error) {
          // stale count — show error but keep button enabled for retry
          toasts.error(result.error);
        } else {
          const bookmarked = result?.data?.isBookmarked;
          if (typeof bookmarked === 'boolean') setIsBookmarked(bookmarked);
        }
      } catch {
        if (!cancelled) toasts.error('Failed to check bookmark');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    checkStatus();
    return () => {
      cancelled = true;
    };
  }, [threadId, initialIsBookmarked]);

  const handleToggle = async () => {
    // Client decides desired state; the server upserts/deletes idempotently
    // (no read-then-write race with a second tab).
    const desired = !isBookmarked;
    setIsLoading(true);
    try {
      const result = await setBookmarkStatus({ threadId, bookmarked: desired });
      if (result?.error) {
        toasts.error(result.error);
      } else if (typeof result?.data?.isBookmarked === 'boolean') {
        const bookmarked = result.data.isBookmarked;
        setIsBookmarked(bookmarked);
        if (bookmarked) toasts.success('Bookmarked');
        else toasts.success('Removed from bookmarks');
      }
    } catch {
      toasts.error('Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const label = isBookmarked ? 'Bookmarked' : 'Bookmark';
  const Icon = isBookmarked ? BookmarkCheck : Bookmark;

  return (
    <div className="hover:scale-105 active:scale-95 transition-transform duration-100">
      <Button
        variant="outline"
        onClick={handleToggle}
        disabled={isLoading}
        aria-label={label}
        className={cn(iconOnly ? 'h-7 w-7 p-0 gap-0' : 'gap-2', className)}
      >
        {isLoading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <>
            <AnimatedIcon icon={Icon} className={cn('h-4 w-4', isBookmarked && 'fill-current')} animateOnHover />
            {!iconOnly && <span className="hidden sm:inline">{label}</span>}
          </>
        )}
      </Button>
    </div>
  );
}

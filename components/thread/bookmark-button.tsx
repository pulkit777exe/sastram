'use client';

import { useState, useEffect } from 'react';
import { Bookmark, BookmarkCheck, Loader2 } from 'lucide-react';
import { toggleBookmark, checkBookmarkStatus } from '@/modules/bookmarks/actions';
import { toasts } from '@/lib/utils/toast';
import { cn } from '@/lib/utils/cn';
import { AnimatedIcon } from '@/components/ui/animated-icon';
import { Button } from '@/components/ui/button';

interface BookmarkButtonProps {
  threadId: string;
  className?: string;
}

export function BookmarkButton({ threadId, className }: BookmarkButtonProps) {
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
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
  }, [threadId]);

  const handleToggle = async () => {
    setIsLoading(true);
    try {
      const result = await toggleBookmark({ threadId });
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

  function renderBookmarkContent() {
    if (isBookmarked) {
      return (
        <>
          <AnimatedIcon icon={BookmarkCheck} className="h-4 w-4 fill-current" animateOnHover />
          <span className="hidden sm:inline">Bookmarked</span>
        </>
      );
    }
    return (
      <>
        <AnimatedIcon icon={Bookmark} className="h-4 w-4" animateOnHover />
        <span className="hidden sm:inline">Bookmark</span>
      </>
    );
  }

  return (
    <div className="hover:scale-105 active:scale-95 transition-transform duration-100">
      <Button variant="outline" onClick={handleToggle} disabled={isLoading} className={cn('gap-2', className)}>
        {isLoading ? <Loader2 size={14} className="animate-spin" /> : renderBookmarkContent()}
      </Button>
    </div>
  );
}

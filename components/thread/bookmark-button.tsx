'use client';

import { useState, useEffect } from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
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
    checkBookmarkStatus({ threadId }).then((result) => {
      const bookmarked = result?.data?.isBookmarked;
      if (typeof bookmarked === 'boolean') setIsBookmarked(bookmarked);
      setIsLoading(false);
    });
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
        {renderBookmarkContent()}
      </Button>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleBookmark, checkBookmarkStatus } from "@/modules/bookmarks/actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { AnimatedIcon } from "@/components/ui/animated-icon";

interface BookmarkButtonProps {
  threadId: string;
  className?: string;
}

export function BookmarkButton({ threadId, className }: BookmarkButtonProps) {
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkBookmarkStatus(threadId).then((result) => {
      if (result && typeof result === "object" && "success" in result && result.success && "isBookmarked" in result) {
        setIsBookmarked(result.isBookmarked || false);
      }
      setIsLoading(false);
    });
  }, [threadId]);

  const handleToggle = async () => {
    setIsLoading(true);
    try {
      const result = await toggleBookmark(threadId);
      if (result && typeof result === "object" && "error" in result) {
        toast.error(result.error);
      } else if (result && typeof result === "object" && "success" in result && result.success && "isBookmarked" in result) {
        setIsBookmarked(result.isBookmarked || false);
        toast.success(
          result.isBookmarked ? "Bookmarked" : "Removed from bookmarks"
        );
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
      <Button
        onClick={handleToggle}
        disabled={isLoading}
        variant="ghost"
        size="sm"
        className={cn("gap-2", className)}
      >
        {isBookmarked ? (
          <>
            <AnimatedIcon icon={BookmarkCheck} className="h-4 w-4 fill-current" animateOnHover />
            <span className="hidden sm:inline">Bookmarked</span>
          </>
        ) : (
          <>
            <AnimatedIcon icon={Bookmark} className="h-4 w-4" animateOnHover />
            <span className="hidden sm:inline">Bookmark</span>
          </>
        )}
      </Button>
    </motion.div>
  );
}


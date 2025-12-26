"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface TagChipProps {
  tag: {
    id: string;
    name: string;
    slug: string;
    color: string;
  };
  onRemove?: () => void;
  clickable?: boolean;
}

export function TagChip({ tag, onRemove, clickable = true }: TagChipProps) {
  const content = (
    <motion.span
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
        "transition-colors",
        clickable && !onRemove && "hover:opacity-80"
      )}
      style={{
        backgroundColor: `${tag.color}20`,
        color: tag.color,
        border: `1px solid ${tag.color}40`,
      }}
    >
      <span>#{tag.name}</span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hover:opacity-70 transition-opacity"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </motion.span>
  );

  if (clickable && !onRemove) {
    return (
      <Link href={`/dashboard/tags/${tag.slug}`}>
        {content}
      </Link>
    );
  }

  return content;
}


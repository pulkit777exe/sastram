'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

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
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        'transition-all duration-100 hover:scale-105 active:scale-95',
        clickable && !onRemove && 'hover:opacity-80'
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
    </span>
  );

  if (clickable && !onRemove) {
    return <Link href={`/dashboard/tags/${tag.slug}`}>{content}</Link>;
  }

  return content;
}

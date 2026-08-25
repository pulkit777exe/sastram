'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/badge';

interface TagChipProps {
  tag: {
    id?: string;
    name: string;
    slug?: string;
    color?: string;
  };
  onRemove?: () => void;
  clickable?: boolean;
}

export function TagChip({ tag, onRemove, clickable = true }: TagChipProps) {
  const content = (
    <Badge
      variant="outline"
      className={cn(
        'px-2.5 py-1 rounded-full',
        'transition-all duration-100 hover:scale-105 active:scale-95',
        clickable && !onRemove && 'hover:opacity-80'
      )}
      style={{
        backgroundColor: tag.color ? `${tag.color}20` : 'color-mix(in srgb, var(--brand) 12%, transparent)',
        color: tag.color ?? 'var(--brand)',
        borderColor: tag.color ? `${tag.color}40` : 'color-mix(in srgb, var(--brand) 25%, transparent)',
      }}
    >
      <span>#{tag.name}</span>
      {onRemove && (
        <Button variant="ghost" size="icon"
          className="h-4 w-4 hover:opacity-70 p-0"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </Badge>
  );

  if (clickable && !onRemove) {
    return <Link href={`/dashboard/tags/${tag.slug ?? tag.name}`}>{content}</Link>;
  }

  return content;
}

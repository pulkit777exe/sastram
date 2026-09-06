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

function getTagStyle(tag: TagChipProps['tag']): React.CSSProperties {
  if (tag.color) {
    return {
      backgroundColor: `${tag.color}20`,
      color: tag.color,
      borderColor: `${tag.color}40`,
    };
  }
  return {
    backgroundColor: 'color-mix(in srgb, var(--brand) 12%, transparent)',
    color: 'var(--brand)',
    borderColor: 'color-mix(in srgb, var(--brand) 25%, transparent)',
  };
}

export function TagChip({ tag, onRemove, clickable = true }: TagChipProps) {
  const isLink = clickable && !onRemove;
  const tagStyle = getTagStyle(tag);

  const content = (
    <Badge
      variant="outline"
      className={cn(
        'px-2.5 py-1 rounded-full',
        'transition-all duration-100 hover:scale-105 active:scale-95',
        isLink && 'hover:opacity-80'
      )}
      style={tagStyle}
    >
      <span>#{tag.name}</span>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
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

  if (isLink) {
    return <Link href={`/dashboard/tags/${tag.slug ?? tag.name}`}>{content}</Link>;
  }

  return content;
}

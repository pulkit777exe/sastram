'use client';

import { useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils/cn';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), {
  ssr: false,
  loading: () => <div className="h-[380px] w-full animate-pulse bg-hover/40" />,
});

interface EmojiPickerPopoverProps {
  trigger: ReactNode;
  onSelect: (emoji: string) => void;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Discord-style emoji picker: search, categories, skin tones and recent
 * history. The heavy data bundle is loaded only after the popover opens.
 */
export function EmojiPickerPopover({
  trigger,
  onSelect,
  align = 'end',
  side = 'bottom',
  sideOffset = 8,
  width = 320,
  height = 380,
  className,
}: EmojiPickerPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={cn('w-auto border-0 bg-transparent p-0 shadow-none', className)}
      >
        <div
          data-emoji-picker
          className="overflow-hidden rounded-card border border-line bg-surface shadow-overlay"
          style={{ width }}
        >
          <EmojiPicker
            onEmojiClick={(emoji) => {
              onSelect(emoji.emoji);
              setOpen(false);
            }}
            autoFocusSearch
            colorScheme="auto"
            emojiStyle="native"
            height={height}
            width={width}
            lazyLoadEmojis
            previewConfig={{ showPreview: false }}
            searchPlaceHolder="Search emoji"
            suggestedEmojisMode="frequent"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

'use client';

import React from 'react';
import { CornerUpLeft, SmilePlus, Pin, Trash2, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmojiPickerPopover } from '@/components/ui/emoji-picker-popover';
import { cn } from '@/lib/utils/cn';

interface MessageActionsProps {
  onReply: () => void;
  onPin?: () => void;
  onReact?: (emoji: string) => void;
  onDelete?: () => void;
  onEdit?: () => void;
  isPinned?: boolean;
  canPin?: boolean;
  canDelete?: boolean;
  canEdit?: boolean;
  className?: string;
}

export function MessageActions({
  onReply,
  onPin,
  onReact,
  onDelete,
  onEdit,
  isPinned = false,
  canPin = false,
  canDelete = false,
  canEdit = false,
  className,
}: MessageActionsProps) {
  const hasAdminActions = (canPin && onPin) || (canDelete && onDelete);

  return (
    <div
      className={cn(
        "absolute right-3 -top-4 flex items-center gap-0 bg-surface border border-line/80 shadow-linear-lg rounded-card p-0.5 transition-all duration-100 z-20",
        className
      )}
    >
      {/* Reply */}
      <ActionBtn title="Reply" onClick={onReply}>
        <CornerUpLeft size={12} />
      </ActionBtn>

      {/* Add reaction — Discord-style picker with search + categories */}
      {onReact && (
        <EmojiPickerPopover
          align="end"
          side="bottom"
          onSelect={onReact}
          trigger={
            <button
              type="button"
              title="Add reaction"
              aria-label="Add reaction"
              className="inline-flex h-7 w-7 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <SmilePlus size={12} />
            </button>
          }
        />
      )}

      {/* Edit (own messages only) */}
      {canEdit && onEdit && (
        <ActionBtn title="Edit message" onClick={onEdit}>
          <Edit2 size={12} />
        </ActionBtn>
      )}

      {/* Divider before admin actions */}
      {hasAdminActions && (
        <span className="w-px h-4 bg-border/60 mx-0.5" />
      )}

      {/* Pin */}
      {canPin && onPin && (
        <ActionBtn
          title={isPinned ? 'Unpin' : 'Pin message'}
          onClick={onPin}
          className={isPinned ? 'text-chart-4 hover:bg-chart-4/10 hover:text-chart-4' : ''}
        >
          <Pin size={12} />
        </ActionBtn>
      )}

      {/* Delete */}
      {canDelete && onDelete && (
        <ActionBtn
          title="Delete message"
          onClick={onDelete}
          className="hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 size={12} />
        </ActionBtn>
      )}
    </div>
  );
}

function ActionBtn({
  title,
  onClick,
  children,
  className,
}: {
  title: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      title={title}
      onClick={onClick}
      className={cn(
        'w-7 h-7 text-muted-foreground hover:bg-muted hover:text-foreground',
        className
      )}
    >
      {children}
    </Button>
  );
}

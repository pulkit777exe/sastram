import React from 'react';
import { CornerUpLeft, Smile, Pin, Trash2, Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface MessageActionsProps {
  onReply: () => void;
  onPin?: () => void;
  onReact?: () => void;
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
        "absolute right-3 -top-4 flex items-center gap-0 bg-background border border-border/80 shadow-lg rounded-xl p-0.5 transition-all duration-100 z-20",
        className
      )}
    >
      {/* Reply */}
      <ActionBtn title="Reply" onClick={onReply}>
        <CornerUpLeft size={12} />
      </ActionBtn>

      {/* React */}
      {onReact && (
        <ActionBtn title="Like" onClick={onReact}>
          <Smile size={12} />
        </ActionBtn>
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
          className={isPinned ? 'text-amber-500 hover:bg-amber-50 hover:text-amber-600' : ''}
        >
          <Pin size={12} />
        </ActionBtn>
      )}

      {/* Delete */}
      {canDelete && onDelete && (
        <ActionBtn
          title="Delete message"
          onClick={onDelete}
          className="hover:bg-red-50 hover:text-red-600"
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
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'w-[26px] h-[26px] rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-100',
        className
      )}
    >
      {children}
    </button>
  );
}

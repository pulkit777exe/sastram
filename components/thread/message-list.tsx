import React, { useState, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ThumbsUp, Reply, Pin, Edit2, Trash2 } from 'lucide-react';
import TimeAgo from '@/components/ui/TimeAgo';
import { editMessage, pinMessage, deleteMessage } from '@/modules/messages/actions';
import { toggleReaction } from '@/modules/reactions/actions';
import { toasts } from '@/lib/utils/toast';
import type { Message } from '@/lib/types/index';
import { useThreadContext } from './thread-context';
import { InlineReplyThread } from './inline-reply-thread';
import { MessageActions } from './message-actions';
import { InlineReplyBox } from './inline-reply-box';
import { AttachmentItem } from './attachment-item';
import { renderContent } from '@/lib/utils/render-content';
import { cn } from '@/lib/utils/cn';
import { useVirtualizer } from '@tanstack/react-virtual';

interface MessageListProps {
  firstUnreadMessageId: string | null;
}

// Compute whether each top-level message is compact (same sender, within 60s)
function computeCompactFlags(messages: Message[]): boolean[] {
  const flags: boolean[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (i === 0) {
      flags.push(false);
    } else {
      const prev = messages[i - 1];
      const curr = messages[i];
      const timeDiff = new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime();
      flags.push(curr.senderId === prev.senderId && timeDiff < 60_000);
    }
  }
  return flags;
}

// Flat, chronological replies list
function getAllDescendants(parentId: string, repliesMap: Map<string, Message[]>): Message[] {
  const direct = repliesMap.get(parentId) || [];
  const all: Message[] = [];

  for (const r of direct) {
    all.push(r);
    all.push(...getAllDescendants(r.id, repliesMap));
  }

  return all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function buildRepliesMap(messages: Message[]): Map<string, Message[]> {
  const map = new Map<string, Message[]>();
  messages.forEach((msg) => {
    if (msg.parentId) {
      const arr = map.get(msg.parentId) || [];
      arr.push(msg);
      map.set(msg.parentId, arr);
    }
  });
  return map;
}

export function MessageList({ firstUnreadMessageId }: MessageListProps) {
  const { allMessages, scrollContainerRef } = useThreadContext();

  const topLevelMessages = useMemo(
    () => allMessages.filter((m) => !m.parentId),
    [allMessages]
  );

  const repliesMap = useMemo(() => buildRepliesMap(allMessages), [allMessages]);

  const compactFlags = useMemo(
    () => computeCompactFlags(topLevelMessages),
    [topLevelMessages]
  );

  const virtualizer = useVirtualizer({
    count: topLevelMessages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 100,
    measureElement: (element) => element?.getBoundingClientRect().height ?? 100,
    overscan: 5,
  });

  // Auto-scroll to bottom when new messages arrive and user is at the bottom
  const prevCountRef = useRef(topLevelMessages.length);
  useLayoutEffect(() => {
    if (topLevelMessages.length > prevCountRef.current) {
      const container = scrollContainerRef.current;
      if (container) {
        const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 120;
        if (isAtBottom) {
          container.scrollTop = container.scrollHeight;
        }
      }
    }
    prevCountRef.current = topLevelMessages.length;
  });

  return (
    <div style={{ position: 'relative', height: `${virtualizer.getTotalSize()}px`, minHeight: 0 }}>
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const msg = topLevelMessages[virtualItem.index];
        const replies = getAllDescendants(msg.id, repliesMap);
        const isCompact = compactFlags[virtualItem.index];
        return (
          <div
            key={msg.id}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <MessageRow
              message={msg}
              isCompact={isCompact}
              isFirstUnread={msg.id === firstUnreadMessageId}
              replies={replies}
            />
          </div>
        );
      })}
    </div>
  );
}

function CompactTimestamp({ time }: { time: Date | string }) {
  const d = typeof time === 'string' ? new Date(time) : time;
  const timeStr = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return (
    <span className="absolute left-2 top-[10px] text-[10px] text-muted-foreground/40 opacity-0 group-hover:opacity-100 select-none w-8 text-right font-mono transition-opacity">
      {timeStr}
    </span>
  );
}

function MessageRow({
  message,
  isCompact,
  isFirstUnread,
  replies,
}: {
  message: Message;
  isCompact: boolean;
  isFirstUnread: boolean;
  replies: Message[];
}) {
  const {
    threadId,
    currentUser,
    activeReplyId,
    onReply,
    onCancelReply,
    onMessagePosted,
    onMessageUpdate,
    aiInlineStatus,
    onTypingStart,
    onTypingStop,
  } = useThreadContext();

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(message.likeCount ?? 0);
  const [isLiking, setIsLiking] = useState(false);

  const [isPinning, setIsPinning] = useState(false);
  
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isOwnMessage = message.senderId === currentUser.id;
  const isShowingReplyBox = activeReplyId === message.id;
  const isDeleted = !!message.deletedAt;
  const isModerator = ['ADMIN', 'MODERATOR', 'OWNER'].includes(currentUser.role || '');

  const canEdit = isOwnMessage && !isDeleted;
  const canDelete = (isOwnMessage || isModerator) && !isDeleted;
  const canPin = isModerator && !isDeleted;

  const aiStatus = aiInlineStatus[message.id];

  const handleSaveEdit = useCallback(async () => {
    const trimmed = editContent.trim();
    if (!trimmed || trimmed === message.content) return;
    setIsSavingEdit(true);
    const res = await editMessage(message.id, trimmed);
    if (!res?.error) {
      onMessageUpdate(message.id, { content: trimmed, isEdited: true, updatedAt: new Date() });
      setIsEditing(false);
      setIsSavingEdit(false);
      return;
    }
    toasts.serverError();
    setIsSavingEdit(false);
  }, [editContent, message.id, message.content, onMessageUpdate]);

  if (isDeleted) {
    return (
      <div
        id={`message-${message.id}`}
        className={cn(
          "group flex gap-3 px-3 py-1.5 rounded-lg hover:bg-muted/20 relative transition-colors duration-75",
          isCompact && "pl-[52px]"
        )}
      >
        {!isCompact && (
          <div className="w-8 h-8 mt-0.5 shrink-0 rounded-full bg-muted/40 flex items-center justify-center">
            <span className="text-muted-foreground/30 text-xs">?</span>
          </div>
        )}
        <div className="flex-1 min-w-0 py-0.5">
          <span className="text-[12px] text-muted-foreground/50 italic">[This message was deleted]</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {isFirstUnread && (
        <div className="flex items-center gap-2.5 my-3" role="separator" aria-label="New messages indicator">
          <div className="flex-1 h-px bg-rose-500/30" />
          <span className="text-[10px] text-rose-500 font-bold uppercase tracking-wider whitespace-nowrap bg-background px-2.5">
            New messages
          </span>
          <div className="flex-1 h-px bg-rose-500/30" />
        </div>
      )}

      <div
        id={`message-${message.id}`}
        className={cn(
          "group flex gap-3 px-3 py-1.5 rounded-lg hover:bg-muted/30 relative transition-colors duration-75",
          isCompact && "pl-[52px]",
          isShowingReplyBox && "bg-indigo-50/20 dark:bg-indigo-950/10"
        )}
      >
        {isCompact ? (
          <CompactTimestamp time={message.createdAt} />
        ) : (
          <Avatar className="w-8 h-8 mt-0.5 shrink-0 ring-1 ring-border/30">
            <AvatarImage src={message.sender.image || ''} />
            <AvatarFallback className="bg-gradient-to-br from-indigo-50 to-violet-50 text-indigo-600 text-xs font-bold">
              {message.sender.name?.substring(0, 2).toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
        )}

        <div className="flex-1 min-w-0">
          {!isCompact && (
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-[13px] font-semibold text-foreground leading-none">
                {message.sender.name || 'Anonymous'}
              </span>
              {isOwnMessage && (
                <span className="bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 text-[9px] px-1.5 py-px rounded-full font-semibold leading-none">
                  you
                </span>
              )}
              {message.isAiResponse && (
                <span className="bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 text-[9px] px-1.5 py-px rounded-full font-semibold leading-none">
                  AI
                </span>
              )}
              {message.isPinned && (
                <span className="text-amber-500 text-[10px] leading-none" title="Pinned">📌</span>
              )}
              <span className="text-[11px] text-muted-foreground/50 font-medium">
                <TimeAgo date={message.createdAt} />
              </span>
              {message.isEdited && (
                <span className="text-[10px] text-muted-foreground/40 italic">edited</span>
              )}
            </div>
          )}

          {isEditing ? (
            <div className="w-full max-w-lg mt-1 relative space-y-2">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="min-h-20 max-h-[250px] resize-none text-[13px]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsEditing(false);
                    setEditContent(message.content);
                  } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void handleSaveEdit();
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsEditing(false);
                    setEditContent(message.content);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={isSavingEdit || !editContent.trim() || editContent === message.content}
                  onClick={() => void handleSaveEdit()}
                >
                  {isSavingEdit ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-foreground/80 text-[13px] leading-relaxed whitespace-pre-wrap wrap-break-word">
              {renderContent(message.content)}
            </div>
          )}

          {aiStatus === 'pending' && !message.isAiResponse && (
            <div className="mt-2 space-y-2 animate-pulse max-w-sm">
              <div className="h-3 w-full bg-violet-500/10 rounded" />
              <div className="h-3 w-5/6 bg-violet-500/10 rounded" />
            </div>
          )}

          {aiStatus === 'failed' && !message.isAiResponse && (
            <p className="text-[11px] text-amber-600 mt-1">
              AI couldn&apos;t process this. Try rephrasing your question.
            </p>
          )}

          {message.attachments && message.attachments.length > 0 && !isEditing && (
            <div className="flex flex-wrap gap-2 mt-2">
              {message.attachments.map((file) => (
                <AttachmentItem key={file.id} file={file} />
              ))}
            </div>
          )}

          {likeCount > 0 && (
            <div className="flex items-center gap-1 mt-1 bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/10 w-fit rounded-full px-2 py-0.5 text-[10px] text-amber-600 font-medium select-none">
              <ThumbsUp size={10} className="fill-current" />
              <span>{likeCount}</span>
            </div>
          )}

          {replies.length > 0 && (
            <InlineReplyThread
              replies={replies}
              onReplyClick={() => onReply(message.id)}
            />
          )}
        </div>

        {!isEditing && (
          <MessageActions
            className="opacity-0 group-hover:opacity-100 transition-all duration-100 scale-95 group-hover:scale-100"
            onReply={() => onReply(message.id)}
            onEdit={canEdit ? () => setIsEditing(true) : undefined}
            onReact={async () => {
              if (isLiking) return;
              setIsLiking(true);
              const wasLiked = isLiked;
              setIsLiked(!wasLiked);
              setLikeCount((prev) => (wasLiked ? Math.max(0, prev - 1) : prev + 1));
              const result = await toggleReaction(message.id, '👍');
              if (result?.error) {
                setIsLiked(wasLiked);
                setLikeCount((prev) => (wasLiked ? prev + 1 : Math.max(0, prev - 1)));
                toasts.error('Failed to update reaction');
              }
              setIsLiking(false);
            }}
            onPin={canPin ? async () => {
              setIsPinning(true);
              const wasPinned = message.isPinned;
              onMessageUpdate(message.id, { isPinned: !wasPinned });
              const res = await pinMessage(message.id);
              if (res?.error) {
                onMessageUpdate(message.id, { isPinned: wasPinned });
                toasts.error('Failed to pin message');
              }
              setIsPinning(false);
            } : undefined}
            onDelete={canDelete ? () => setShowDeleteConfirm(true) : undefined}
            isPinned={message.isPinned}
            canPin={canPin}
            canDelete={canDelete}
            canEdit={canEdit}
          />
        )}

        {showDeleteConfirm && (
          <div className="absolute right-4 top-2 bg-background border border-border shadow-lg rounded-lg p-2 flex items-center gap-2 text-xs z-30">
            <span className="font-medium text-destructive">Delete message?</span>
            <Button
              size="sm"
              variant="destructive"
              className="h-6 px-2 text-[10px]"
              disabled={isDeleting}
              onClick={async () => {
                setIsDeleting(true);
                const res = await deleteMessage(message.id);
                if (!res?.error) {
                  onMessageUpdate(message.id, { deletedAt: new Date() });
                  setShowDeleteConfirm(false);
                } else {
                  toasts.serverError();
                }
                setIsDeleting(false);
              }}
            >
              Delete
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      {isShowingReplyBox && (
        <div className="mt-1 ml-13">
          <InlineReplyBox
            parentMessage={message}
            threadId={threadId}
            currentUser={currentUser}
            visualDepth={1}
            onCancel={onCancelReply}
            onMessagePosted={onMessagePosted}
            onTypingStart={onTypingStart}
            onTypingStop={onTypingStop}
          />
        </div>
      )}
    </>
  );
}

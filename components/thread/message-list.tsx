import React, { useState, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ThumbsUp, Pin, Loader2 } from 'lucide-react';
import TimeAgo from '@/components/ui/TimeAgo';
import { editMessage, pinMessage, deleteMessage } from '@/modules/messages/actions';
import { toggleReaction } from '@/modules/reactions/actions';
import { toasts } from '@/lib/utils/toast';
import type { Message } from '@/lib/types/index';
import { useThreadDataContext, useThreadUIStateContext } from './thread-context';
import { InlineReplyThread } from './inline-reply-thread';
import { MessageActions } from './message-actions';
import { InlineReplyBox } from './inline-reply-box';
import { Badge } from '@/components/ui/badge';
import { AttachmentItem } from './attachment-item';
import { PollDisplay } from './poll-display';
import { renderContent } from '@/components/thread/render-content';
import { canModerate } from '@/lib/config/permissions';
import { cn } from '@/lib/utils/cn';
import { useVirtualizer } from '@tanstack/react-virtual';
import { isAiNotConfigured } from '@/lib/services/ai-sentinel';
import { AiNotConfiguredNotice } from '@/components/ui/ai-not-configured';
import { SkeletonSwap } from '@/components/ui/skeleton-swap';

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

// Simple helper: get direct replies for a parent, sorted chronologically.
// KISS: removed premature cache optimization — sorting <100 items is trivial.
// No recursion or descendant flattening needed for most threads; direct lookup keeps code simple and readable.
function getRepliesForParent(parentId: string, repliesMap: Map<string, Message[]>): Message[] {
  const replies = repliesMap.get(parentId) || [];
  // Return a sorted copy — explicit loop sort, no caching.
  return [...replies].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
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
  const { scrollContainerRef } = useThreadDataContext();
  const { allMessages } = useThreadUIStateContext();

  const topLevelMessages = useMemo(
    () => allMessages.filter((m) => !m.parentId),
    [allMessages]
  );

  const repliesMap = useMemo(() => buildRepliesMap(allMessages), [allMessages]);

  const compactFlags = useMemo(
    () => computeCompactFlags(topLevelMessages),
    [topLevelMessages]
  );

  // eslint-disable-next-line react-hooks/incompatible-library
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
  }, [topLevelMessages.length, scrollContainerRef]);

  return (
    <div style={{ position: 'relative', height: `${virtualizer.getTotalSize()}px`, minHeight: 0 }}>
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const msg = topLevelMessages[virtualItem.index];
        const replies = getRepliesForParent(msg.id, repliesMap);
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
    <span className="absolute left-2 top-2.5 text-xs text-muted-foreground/40 opacity-0 group-hover:opacity-100 select-none w-8 text-right font-mono transition-opacity">
      {timeStr}
    </span>
  );
}

const MessageRow = React.memo(function MessageRow({
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
    onReply,
    onCancelReply,
    onMessagePosted,
    onOptimisticMessage,
    onMessageUpdate,
  } = useThreadDataContext();
  const { activeReplyId, aiInlineStatus } = useThreadUIStateContext();

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(message.likeCount ?? 0);
  const [isLiking, setIsLiking] = useState(false);

  const [_isPinning, setIsPinning] = useState(false);
  
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isOwnMessage = message.senderId === currentUser.id;
  const isShowingReplyBox = activeReplyId === message.id;
  const isDeleted = !!message.deletedAt;
  const isModerator = canModerate(currentUser.role);
  const activeReplyTarget = activeReplyId
    ? replies.find((reply) => reply.id === activeReplyId) ?? null
    : null;

  const canEdit = isOwnMessage && !isDeleted;
  const canDelete = (isOwnMessage || isModerator) && !isDeleted;
  const canPin = isModerator && !isDeleted;

  const aiStatus = aiInlineStatus[message.id];

  const handleSaveEdit = useCallback(async () => {
    const trimmed = editContent.trim();
    if (!trimmed || trimmed === message.content) return;
    setIsSavingEdit(true);
    const res = await editMessage({ messageId: message.id, content: trimmed });
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
          "group flex gap-3 px-3 py-1.5 rounded-control hover:bg-hover/50 relative transition-colors duration-75",
          isCompact && "pl-13"
        )}
      >
        {!isCompact && (
          <div className="w-8 h-8 mt-0.5 shrink-0 rounded-full bg-field flex items-center justify-center">
            <span className="text-ink-3/30 text-xs">?</span>
          </div>
        )}
        <div className="flex-1 min-w-0 py-0.5">
          <span className="text-xs text-ink-3/50 italic">[This message was deleted]</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {isFirstUnread && (
        <div className="flex items-center gap-2.5 my-3" role="separator" aria-label="New messages indicator">
          <div className="flex-1 h-px bg-brand/30" />
          <span className="text-xs text-brand font-bold uppercase tracking-wider whitespace-nowrap bg-surface px-2.5">
            New messages
          </span>
          <div className="flex-1 h-px bg-brand/30" />
        </div>
      )}

      <div
        id={`message-${message.id}`}
        className={cn(
          "group flex gap-3 px-3 py-1.5 rounded-control hover:bg-muted/30 relative transition-colors duration-75",
          isCompact && "pl-13",
          isShowingReplyBox && "bg-brand/10 dark:bg-brand/10"
        )}
      >
        {isCompact ? (
          <CompactTimestamp time={message.createdAt} />
        ) : (
          <Avatar className="w-8 h-8 mt-0.5 shrink-0 ring-1 ring-border/30">
            <AvatarImage src={message.sender?.image || ''} />
            <AvatarFallback className="bg-brand/10 text-brand text-xs font-bold">
              {message.sender?.name?.substring(0, 2).toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
        )}

        <div className="flex-1 min-w-0">
          {!isCompact && (
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-sm font-semibold text-foreground leading-none">
                {message.sender?.name || 'Anonymous'}
              </span>
              {isOwnMessage && (
                <Badge variant="live" className="px-1.5 py-px text-xs leading-none">
                  you
                </Badge>
              )}
              {message.isAiResponse && (
                <Badge variant="live" className="px-1.5 py-px text-xs leading-none">
                  Sai
                </Badge>
              )}
              {message.truncated && (
                <span className="text-xs text-muted-foreground/60 italic">
                  (truncated)
                </span>
              )}
              {message.isPinned && (
                <span className="text-chart-4 inline-flex items-center gap-0.5 text-xs leading-none" title="Pinned">
                  <Pin size={10} className="fill-current" />
                  Pinned
                </span>
              )}
              <span className="text-xs text-muted-foreground/50 font-medium">
                <TimeAgo date={message.createdAt} />
              </span>
              {message.isEdited && (
                <span className="text-xs text-muted-foreground/40 italic">edited</span>
              )}
            </div>
          )}

          {isEditing ? (
            <div className="w-full max-w-lg mt-1 relative space-y-2">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="min-h-20 max-h-64 resize-none text-sm"
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
          ) : message.isAiResponse ? (
            <div className="mt-0.5 rounded-control bg-brand/[0.04] dark:bg-brand/[0.07] px-3 py-2 -mx-1">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-brand/70">
                <span className="h-1 w-1 rounded-full bg-brand/60" />
                Synthesis
              </div>
              <div className="text-foreground/85 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">
                {isAiNotConfigured(message.content) ? (
                  <AiNotConfiguredNotice />
                ) : message.content ? (
                  renderContent(message.content)
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground/60 text-xs">
                    <Loader2 size={12} className="animate-spin" />
                    Generating…
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-foreground/80 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">
              {renderContent(message.content)}
            </div>
          )}

          {aiStatus === 'pending' && !message.isAiResponse && (
            <SkeletonSwap
              ready={false}
              lines={2}
              barHeight={12}
              lineHeight={16}
              className="mt-2 max-w-sm"
              skeleton={
                <div className="space-y-2">
                  <div className="h-3 w-full bg-brand/10 rounded" />
                  <div className="h-3 w-5/6 bg-brand/10 rounded" />
                </div>
              }
            />
          )}

          {aiStatus === 'failed' && !message.isAiResponse && (
            <p className="text-xs text-chart-4 mt-1">
              Sai couldn&apos;t process this. Try rephrasing your question.
            </p>
          )}

          {message.attachments && message.attachments.length > 0 && !isEditing && (
            <div className="flex flex-wrap gap-2 mt-2">
              {message.attachments.map((file) => (
                <AttachmentItem key={file.id} file={file} />
              ))}
            </div>
          )}

          {message.poll && !isEditing && (
            <div className="mt-2 max-w-lg">
              <PollDisplay
                poll={{
                  id: message.poll.id,
                  threadId: message.poll.threadId,
                  question: message.poll.question,
                  options: message.poll.options,
                  isActive: message.poll.isActive,
                  expiresAt: message.poll.expiresAt,
                }}
              />
            </div>
          )}

          {likeCount > 0 && (
            <div className="flex items-center gap-1 mt-1 bg-chart-4/5 hover:bg-chart-4/10 border border-chart-4/10 w-fit rounded-full px-2 py-0.5 text-xs text-chart-4 font-medium select-none">
              <ThumbsUp size={10} className="fill-current" />
              <span>{likeCount}</span>
            </div>
          )}

          {replies.length > 0 && (
            <InlineReplyThread
              replies={replies}
              onReplyClick={(messageId = message.id) => onReply(messageId)}
            />
          )}

          {activeReplyTarget && (
            <InlineReplyBox
              parentMessage={activeReplyTarget}
              threadId={threadId}
              currentUser={currentUser}
              visualDepth={Math.min(activeReplyTarget.depth + 1, 3)}
              onCancel={onCancelReply}
              onMessagePosted={onMessagePosted}
              onOptimisticMessage={onOptimisticMessage}
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
              const result = await toggleReaction({ messageId: message.id, emoji: '👍' });
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
              const res = await pinMessage({ messageId: message.id });
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
          <div className="absolute right-4 top-2 bg-surface border border-line shadow-linear-lg rounded-control p-2 flex items-center gap-2 text-xs z-30">
            <span className="font-medium text-destructive">Delete message?</span>
            <Button
              size="sm"
              variant="destructive"
              disabled={isDeleting}
              onClick={async () => {
                setIsDeleting(true);
                const res = await deleteMessage({ messageId: message.id });
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
            onOptimisticMessage={onOptimisticMessage}
          />
        </div>
      )}
    </>
  );
});

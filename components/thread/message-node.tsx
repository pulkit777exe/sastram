'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Reply, ThumbsUp, Edit2, Trash2, Pin, ArrowRight } from 'lucide-react';
import TimeAgo from '@/components/ui/TimeAgo';
import {
  editMessage,
  pinMessage,
  deleteMessage,
  getMessageEditHistory,
} from '@/modules/messages/actions';
import { toggleReaction } from '@/modules/reactions/actions';
import { toasts } from '@/lib/utils/toast';
import type { MessageNode } from '@/modules/messages/types';
import type { Message } from '@/lib/types/index';
import { AppealMessageModal } from './appeal-message-modal';
import { InlineReplyBox } from './inline-reply-box';
import { DeletedMessagePlaceholder } from './deleted-message-placeholder';
import { AttachmentItem } from './attachment-item';
import type { Attachment } from '@/lib/types/index';
import { countDescendants } from '@/modules/messages/service';
import { ReportButton } from './report-button';
import { useThreadDataContext, useThreadUIStateContext } from './thread-context';
import { isAiNotConfigured } from '@/lib/services/ai-sentinel';
import { AiNotConfiguredNotice } from '@/components/ui/ai-not-configured';

const MAX_VISUAL_DEPTH = 4;
const INDENT_PX = 20;

type EditHistoryEntry = {
  id: string;
  content: string;
  editedAt: Date | string;
};

function formatEditedAt(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderMentionContent(content: string) {
  return content.split(/(@[\w.-]+)/g).map((part, index) => {
    if (part.startsWith('@')) {
      return (
        <span key={`${part}-${index}`} className="text-blue-600 font-medium">
          {part}
        </span>
      );
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function renderDiffLine(text: string, compareTo: string, className: string) {
  const compareWords = new Set(compareTo.toLowerCase().split(/\s+/));
  return text.split(/(\s+)/).map((token, index) => {
    if (!token.trim()) {
      return <span key={`${token}-${index}`}>{token}</span>;
    }
    const isDifferent = !compareWords.has(token.toLowerCase());
    return (
      <span key={`${token}-${index}`} className={isDifferent ? className : undefined}>
        {token}
      </span>
    );
  });
}

function LikeCount({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove('is-animating');
    void el.offsetWidth;
    el.classList.add('is-animating');
  }, [value]);

  if (value === 0) return null;

  const chars = String(value).split('');

  return (
    <span ref={ref} className="t-digit-group text-[11px] font-medium tabular-nums">
      {chars.map((ch, i) => (
        <span
          key={i}
          className="t-digit"
          data-stagger={i === chars.length - 2 ? '1' : i === chars.length - 1 ? '2' : undefined}
        >
          {ch}
        </span>
      ))}
    </span>
  );
}

interface CommentNodeProps {
  node: MessageNode;
  depth: number;
}

export const CommentNode = React.memo(function CommentNode({
  node,
  depth,
}: CommentNodeProps) {
  const {
    threadId,
    currentUser,
    onReply,
    onCancelReply,
    onToggleCollapse,
    onMessagePosted,
    onOptimisticMessage,
    onFocusBranch,
    onMessageUpdate,
  } = useThreadDataContext();
  const {
    activeReplyId,
    collapsedIds,
    allMessages,
    animateMessageId,
    aiInlineStatus,
  } = useThreadUIStateContext();
  const [appealOpen, setAppealOpen] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(node.likeCount ?? 0);
  const [isLiking, setIsLiking] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(node.content);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPinning, setIsPinning] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [editHistory, setEditHistory] = useState<EditHistoryEntry[]>([]);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isCollapsed = collapsedIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const isOwnMessage = node.senderId === currentUser.id;
  const isShowingReplyBox = activeReplyId === node.id;
  const isDeleted = !!node.deletedAt;
  const beyondDepthLimit = depth >= MAX_VISUAL_DEPTH;
  const descendantCount = countDescendants(node);
  const shouldAnimate = animateMessageId === node.id;
  const aiStatus = aiInlineStatus[node.id];
  const isModerator = ['ADMIN', 'MODERATOR', 'OWNER'].includes(currentUser.role || '');

  const canEdit = isOwnMessage && !isDeleted;
  const canDelete = (isOwnMessage || isModerator) && !isDeleted;
  const canPin = isModerator && !isDeleted;

  const parentMessage = node.parentId ? allMessages.find((m) => m.id === node.parentId) : null;

  const handleSaveEdit = useCallback(async () => {
    const trimmed = editContent.trim();
    if (!trimmed || trimmed === node.content) return;
    setIsSavingEdit(true);
    const res = await editMessage(node.id, trimmed);
    if (!res?.error) {
      onMessageUpdate(node.id, { content: trimmed, isEdited: true, updatedAt: new Date() });
      setIsEditing(false);
      setIsSavingEdit(false);
      return;
    }
    toasts.serverError();
    setIsSavingEdit(false);
  }, [editContent, node.id, node.content, onMessageUpdate]);

  const openHistoryModal = useCallback(async () => {
    setIsHistoryOpen(true);
    setIsLoadingHistory(true);
    const res = await getMessageEditHistory(node.id);
    if (res.error || !Array.isArray(res.data)) {
      setEditHistory([]);
      toasts.serverError();
      setIsLoadingHistory(false);
      return;
    }
    setEditHistory(
      res.data.map((entry) => ({
        id: entry.id,
        content: entry.content,
        editedAt: entry.editedAt,
      }))
    );
    setIsLoadingHistory(false);
  }, [node.id]);

  const historyVersions = useMemo(() => {
    const versions: Array<EditHistoryEntry & { isCurrent?: boolean }> = [
      { id: `${node.id}-current`, content: node.content, editedAt: node.updatedAt, isCurrent: true },
      ...editHistory,
    ];
    return versions;
  }, [node.id, node.content, node.updatedAt, editHistory]);

  return (
    <div
      id={`message-${node.id}`}
      data-message-id={node.id}
      className={`relative group/branch ${shouldAnimate ? 'animate-in slide-in-from-top-1 fade-in duration-200' : ''}`}
      style={{ marginLeft: depth > 0 ? `${INDENT_PX}px` : 0 }}
    >
      {/* Left border line — clickable to collapse */}
      {depth > 0 && (
        <button
          onClick={() => onToggleCollapse(node.id)}
          className="absolute left-0 top-0 bottom-0 w-0.5 cursor-pointer z-10
                     bg-brand/15 hover:bg-brand/40
                     transition-colors duration-150 rounded-full"
          style={{ marginLeft: '-11px' }}
          aria-label={isCollapsed ? 'Expand thread' : 'Collapse thread'}
        />
      )}

      {/* Message Card */}
      {isDeleted ? (
        <DeletedMessagePlaceholder originalContent={node.content} canViewOriginal={isModerator} />
      ) : (
        <div className="py-2">
          {/* Reply reference */}
          {parentMessage && depth > 0 && (
            <div className="flex items-center gap-2 mb-1.5 pl-1">
              <Reply size={11} className="text-muted-foreground/60 shrink-0" />
              <Avatar className="w-3.5 h-3.5 shrink-0">
                <AvatarImage src={parentMessage.sender?.image || ''} />
                <AvatarFallback className="text-[7px]">
                  {parentMessage.sender?.name?.substring(0, 1).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <span className="text-[11px] text-muted-foreground/70 truncate">
                <span className="font-medium text-foreground/60">
                  {parentMessage.sender?.name || 'Anonymous'}
                </span>
                <span className="mx-1">·</span>
                <span className="truncate max-w-[180px] inline-block align-bottom">
                  {parentMessage.content.slice(0, 45)}
                  {parentMessage.content.length > 45 ? '…' : ''}
                </span>
              </span>
            </div>
          )}

          <div className="flex items-start gap-3">
            <Avatar className="w-8 h-8 shrink-0 border border-border/40">
              <AvatarImage src={node.sender?.image || ''} />
              <AvatarFallback className="bg-brand/10 text-brand text-xs font-bold">
                {node.sender?.name?.substring(0, 2).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground text-sm">
                  {node.sender?.name || 'Anonymous'}
                </span>
                {isOwnMessage && (
                  <span className="bg-brand/15 text-brand text-[9px] px-1.5 py-px rounded-full font-medium">
                    You
                  </span>
                )}
                {node.isAiResponse && (
                  <span className="bg-brand/10 text-brand text-[9px] px-1.5 py-px rounded-full font-medium">
                  Sai
                </span>
                )}
                {node.isPinned && <span className="text-amber-500 text-[10px]">📌</span>}
                <span className="text-[11px] text-muted-foreground/60 font-medium">
                  <TimeAgo date={node.createdAt} />
                </span>
                {node.isEdited && (
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground underline-offset-2 hover:underline"
                    title={`Last edited ${formatEditedAt(node.updatedAt)}`}
                    onClick={openHistoryModal}
                  >
                    edited
                  </button>
                )}
              </div>

              {isEditing ? (
                <div className="w-full max-w-lg mt-1 relative space-y-2">
                  <Textarea
                    ref={editTextareaRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="min-h-20 max-h-[250px] resize-none text-[14px]"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsEditing(false);
                        setEditContent(node.content);
                        return;
                      }
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
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
                        setEditContent(node.content);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={isSavingEdit || !editContent.trim() || editContent === node.content}
                      onClick={() => void handleSaveEdit()}
                    >
                      {isSavingEdit ? 'Saving...' : 'Save Edit'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-foreground/80 text-[14px] leading-relaxed whitespace-pre-wrap wrap-break-word">
                  {node.isAiResponse && isAiNotConfigured(node.content) ? (
                    <AiNotConfiguredNotice />
                  ) : (
                    renderMentionContent(node.content)
                  )}
                </div>
              )}

              {aiStatus === 'pending' && !node.isAiResponse && (
                <div className="mt-2 space-y-2 animate-pulse">
                  <div className="h-3 w-full bg-brand/20 rounded" />
                  <div className="h-3 w-5/6 bg-brand/20 rounded" />
                  <div className="h-3 w-4/5 bg-brand/20 rounded" />
                </div>
              )}
              {aiStatus === 'failed' && !node.isAiResponse && (
                <p className="text-[11px] text-amber-600 mt-1">
                  Sai couldn&apos;t process this. Try rephrasing your question.
                </p>
              )}

              {/* Attachments */}
              {node.attachments && node.attachments.length > 0 && !isEditing && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {node.attachments.map((file) => (
                    <AttachmentItem key={(file as Attachment).id} file={file as Attachment} />
                  ))}
                </div>
              )}

              {/* Action bar */}
              {!isEditing && (
                <div className="flex items-center gap-3 pt-1.5">
                  <button
                    onClick={async () => {
                      if (isLiking) return;
                      setIsLiking(true);
                      const wasLiked = isLiked;
                      setIsLiked(!wasLiked);
                      setLikeCount((prev) => (wasLiked ? Math.max(0, prev - 1) : prev + 1));
                      const result = await toggleReaction(node.id, '👍');
                      if (result?.error) {
                        setIsLiked(wasLiked);
                        setLikeCount((prev) => (wasLiked ? prev + 1 : Math.max(0, prev - 1)));
                        toasts.error('Failed to update like');
                      }
                      setIsLiking(false);
                    }}
                    disabled={isLiking}
                    aria-label={isLiked ? 'Unlike this message' : 'Like this message'}
                    aria-pressed={isLiked}
                    className={`flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded ${isLiked ? 'text-amber-500' : 'text-muted-foreground/60 hover:text-amber-500'}`}
                  >
                    <ThumbsUp size={13} className={isLiked ? 'fill-current' : ''} />
                    <LikeCount value={likeCount} />
                  </button>

                  {!beyondDepthLimit && (
                    <button
                      onClick={() => onReply(node.id)}
                      aria-label="Reply to this message"
                      className="flex items-center gap-1 text-muted-foreground/60 hover:text-brand transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
                    >
                      <Reply size={13} />
                      <span className="text-[11px] font-medium">Reply</span>
                    </button>
                  )}

                  {beyondDepthLimit && hasChildren && (
                    <button
                      onClick={() => onFocusBranch(node.id)}
                      className="flex items-center gap-1 text-brand hover:text-brand transition-colors"
                    >
                      <span className="text-[11px] font-medium">Continue this thread</span>
                      <ArrowRight size={12} />
                    </button>
                  )}

                  <ReportButton messageId={node.id} />

                  <button
                    onClick={() => setAppealOpen(true)}
                    className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground hover:underline transition-colors hidden sm:block"
                  >
                    Appeal
                  </button>

                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    {canEdit && (
                      <button
                        onClick={() => setIsEditing(true)}
                        aria-label="Edit message"
                        className="text-muted-foreground/40 hover:text-muted-foreground transition-colors p-1 rounded opacity-0 group-hover/branch:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title="Edit message"
                      >
                        <Edit2 size={13} />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => setShowDeleteConfirm((prev) => !prev)}
                        disabled={isDeleting}
                        aria-label="Delete message"
                        className="text-muted-foreground/40 hover:text-red-500 transition-colors p-1 rounded opacity-0 group-hover/branch:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title="Delete message"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                    {canPin && (
                      <button
                        onClick={async () => {
                          setIsPinning(true);
                          const wasPinned = node.isPinned;
                          onMessageUpdate(node.id, { isPinned: !wasPinned });
                          const res = await pinMessage(node.id);
                          if (res?.error) {
                            onMessageUpdate(node.id, { isPinned: wasPinned });
                            toasts.error('Failed to pin message. Try again.');
                          }
                          setIsPinning(false);
                        }}
                        disabled={isPinning}
                        aria-label={node.isPinned ? 'Unpin message' : 'Pin message'}
                        className={`transition-colors p-1 rounded opacity-0 group-hover/branch:opacity-100 focus-visible:opacity-100 ${node.isPinned ? 'text-brand opacity-100' : 'text-muted-foreground/40 hover:text-brand'}`}
                        title={node.isPinned ? 'Unpin message' : 'Pin message'}
                      >
                        <Pin size={13} />
                      </button>
                    )}
                    {hasChildren && (
                      <span className="text-[10px] text-muted-foreground/40 tabular-nums ml-2 hidden sm:inline-block">
                        {descendantCount} {descendantCount === 1 ? 'reply' : 'replies'}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {showDeleteConfirm && canDelete && (
                <div className="mt-2 flex items-center gap-2 rounded-md border border-red-200/80 bg-red-50/60 px-2.5 py-1.5 text-[11px] text-red-700">
                  <span>Are you sure?</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-6 px-2 text-[11px]"
                    disabled={isDeleting}
                    onClick={async () => {
                      setIsDeleting(true);
                      const res = await deleteMessage(node.id);
                      if (!res?.error) {
                        onMessageUpdate(node.id, { deletedAt: new Date() });
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
                    className="h-6 px-2 text-[11px]"
                    disabled={isDeleting}
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Inline reply box */}
      {isShowingReplyBox && !beyondDepthLimit && (
        <InlineReplyBox
          parentMessage={node}
          threadId={threadId}
          currentUser={currentUser}
          visualDepth={depth + 1}
          onCancel={onCancelReply}
          onMessagePosted={onMessagePosted}
          onOptimisticMessage={onOptimisticMessage}
        />
      )}

      {/* Collapsed pill */}
      {hasChildren && isCollapsed && !beyondDepthLimit && (
        <button
          onClick={() => onToggleCollapse(node.id)}
          className="mt-1 ml-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full
                     bg-brand/10 dark:bg-brand/20 text-brand dark:text-brand
                     text-[11px] font-semibold hover:bg-brand/15 dark:hover:bg-brand/20
                     transition-colors cursor-pointer select-none"
        >
          <span>
            [+] {descendantCount} {descendantCount === 1 ? 'reply' : 'replies'}
          </span>
        </button>
      )}

      {/* Children (recursive) */}
      {hasChildren && !isCollapsed && !beyondDepthLimit && (
        <div className="mt-1 space-y-0 transition-all duration-300 ease-in-out overflow-hidden">
          {node.children.map((child) => (
            <CommentNode
              key={child.id}
              node={child}
              depth={depth + 1}
            />
          ))}
        </div>
      )}

      {/* "Continue this thread" for beyond depth limit */}
      {beyondDepthLimit && hasChildren && (
        <div className="mt-1 ml-4">
          <button
            onClick={() => onFocusBranch(node.id)}
            className="flex items-center gap-1.5 text-[12px] font-medium text-brand hover:text-brand transition-colors"
          >
            <span>Continue this thread →</span>
          </button>
        </div>
      )}

      <AppealMessageModal
        messageId={node.id}
        isOpen={appealOpen}
        onClose={() => setAppealOpen(false)}
      />

      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit History</DialogTitle>
            <DialogDescription>Review previous versions of this message.</DialogDescription>
          </DialogHeader>

          {isLoadingHistory ? (
            <div className="py-8 text-sm text-muted-foreground">Loading history...</div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
              {historyVersions.map((version, index) => {
                const older = historyVersions[index + 1];
                return (
                  <div key={version.id} className="rounded-lg border border-border/60 p-3 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{version.isCurrent ? 'Current version' : 'Previous version'}</span>
                      <span>{formatEditedAt(version.editedAt)}</span>
                    </div>
                    <div className="rounded-md bg-muted/40 p-2 text-sm whitespace-pre-wrap">
                      {older ? (
                        <div className="space-y-1">
                          <p className="text-[11px] font-medium text-emerald-700">Additions</p>
                          <p>{renderDiffLine(version.content, older.content, 'bg-emerald-100 text-emerald-800 rounded px-0.5')}</p>
                          <p className="text-[11px] font-medium text-rose-700 pt-1">Removals</p>
                          <p>{renderDiffLine(older.content, version.content, 'bg-rose-100 text-rose-700 rounded px-0.5 line-through')}</p>
                        </div>
                      ) : (
                        version.content
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
});
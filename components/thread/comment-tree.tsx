'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Reply,
  FileIcon,
  Download,
  ThumbsUp,
  X,
  Loader2,
  Trash2,
  Edit2,
  Pin,
  ArrowRight,
} from 'lucide-react';
import TimeAgo from '@/components/ui/TimeAgo';
import type { Message, Attachment } from '@/lib/types/index';
import type { MessageNode } from '@/modules/messages/types';
import {
  buildMessageTree,
  countDescendants,
  loadCollapseStates,
  saveCollapseState,
} from '@/modules/messages/service';
import {
  postMessage,
  editMessage,
  pinMessage,
  deleteMessage,
  getMessageEditHistory,
} from '@/modules/messages/actions';
import { toggleReaction } from '@/modules/reactions/actions';
import { toasts } from '@/lib/utils/toast';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ReportButton } from './report-button';
import { AppealMessageModal } from './appeal-message-modal';
import Image from 'next/image';

const MAX_VISUAL_DEPTH = 4;
const INDENT_PX = 20;

function findNodeById(nodes: MessageNode[], id: string): MessageNode | null {
  const stack = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.id === id) return node;
    if (node.children.length > 0) {
      stack.push(...node.children);
    }
  }
  return null;
}

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

// ─── Main Component ────────────────────────────────────────

interface CommentTreeProps {
  messages: Message[];
  threadId: string;
  currentUser: {
    id: string;
    name: string | null;
    image: string | null;
    role?: string;
  };
  aiInlineStatus?: Record<string, 'pending' | 'failed'>;
}

export function CommentTree({
  messages,
  threadId,
  currentUser,
  aiInlineStatus = {},
  onTypingStart,
  onTypingStop,
}: CommentTreeProps & {
  onTypingStart?: () => void;
  onTypingStop?: () => void;
}) {
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [localMessages, setLocalMessages] = useState<Message[]>(messages);
  const [animateMessageId, setAnimateMessageId] = useState<string | null>(null);
  const animateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const focusedId = searchParams.get('focus');

  // Load collapse states from localStorage on mount
  useEffect(() => {
    const states = loadCollapseStates(threadId);
    const collapsed = new Set<string>();
    states.forEach((isCollapsed, messageId) => {
      if (isCollapsed) collapsed.add(messageId);
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsedIds(collapsed);
  }, [threadId]);

  // Sync messages prop and handle streaming updates
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalMessages((prev) => {
      // Create a map of existing messages for quick lookup
      const existingMap = new Map(prev.map((msg) => [msg.id, msg]));

      // Create a map of new messages for quick lookup
      const newMap = new Map(messages.map((msg) => [msg.id, msg]));

      // Update with new messages, preserving existing ones
      const updated = messages.map((msg) => {
        // If message exists and has content changes, update it (for streaming)
        if (existingMap.has(msg.id) && existingMap.get(msg.id)?.content !== msg.content) {
          return msg;
        }
        // If message is new, add it
        if (!existingMap.has(msg.id)) {
          return msg;
        }
        // If no changes, keep existing
        return existingMap.get(msg.id)!;
      });

      // Handle case where messages are removed from props
      // We only keep messages that are present in the new messages list
      // Filter out messages that are no longer in the new messages list
      return updated.filter((msg) => newMap.has(msg.id));
    });
  }, [messages]);

  // Build tree from flat messages — memoized
  const tree = useMemo(() => buildMessageTree(localMessages), [localMessages]);
  const focusedNode = useMemo(
    () => (focusedId ? findNodeById(tree, focusedId) : null),
    [tree, focusedId]
  );

  const toggleCollapse = useCallback(
    (messageId: string) => {
      setCollapsedIds((prev) => {
        const next = new Set(prev);
        const isCollapsed = next.has(messageId);
        if (isCollapsed) {
          next.delete(messageId);
        } else {
          next.add(messageId);
        }
        saveCollapseState(threadId, messageId, !isCollapsed);
        return next;
      });
    },
    [threadId]
  );

  const handleReply = useCallback((messageId: string) => {
    // Only one reply box at a time
    setActiveReplyId((prev) => (prev === messageId ? null : messageId));
  }, []);

  const handleCancelReply = useCallback(() => {
    setActiveReplyId(null);
  }, []);

  const handleMessageUpdate = useCallback((messageId: string, updates: Partial<Message>) => {
    setLocalMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, ...updates } : m)));
  }, []);

  const handleMessagePosted = useCallback((newMessage: Message) => {
    setLocalMessages((prev) => [...prev, newMessage]);
    setActiveReplyId(null);
    setAnimateMessageId(newMessage.id);
    if (animateTimerRef.current) {
      clearTimeout(animateTimerRef.current);
    }
    animateTimerRef.current = setTimeout(() => {
      setAnimateMessageId(null);
    }, 700);
  }, []);

  useEffect(() => {
    return () => {
      if (animateTimerRef.current) {
        clearTimeout(animateTimerRef.current);
      }
    };
  }, []);

  const handleFocusBranch = useCallback(
    (messageId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('focus', messageId);
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const clearFocus = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('focus');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [router, pathname, searchParams]);

  if (tree.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {focusedNode ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 bg-background/80">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              Focused Thread
            </div>
            <button
              onClick={clearFocus}
              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Back to full thread
            </button>
          </div>
          <CommentNode
            key={focusedNode.id}
            node={focusedNode}
            depth={0}
            threadId={threadId}
            currentUser={currentUser}
            activeReplyId={activeReplyId}
            collapsedIds={collapsedIds}
            onReply={handleReply}
            onCancelReply={handleCancelReply}
            onToggleCollapse={toggleCollapse}
            onMessagePosted={handleMessagePosted}
            onFocusBranch={handleFocusBranch}
            onMessageUpdate={handleMessageUpdate}
            allMessages={localMessages}
            animateMessageId={animateMessageId}
            aiInlineStatus={aiInlineStatus}
            onTypingStart={onTypingStart}
            onTypingStop={onTypingStop}
          />
        </div>
      ) : (
        tree.map((node) => (
          <CommentNode
            key={node.id}
            node={node}
            depth={0}
            threadId={threadId}
            currentUser={currentUser}
            activeReplyId={activeReplyId}
            collapsedIds={collapsedIds}
            onReply={handleReply}
            onCancelReply={handleCancelReply}
            onToggleCollapse={toggleCollapse}
            onMessagePosted={handleMessagePosted}
            onFocusBranch={handleFocusBranch}
            onMessageUpdate={handleMessageUpdate}
            allMessages={localMessages}
            animateMessageId={animateMessageId}
            aiInlineStatus={aiInlineStatus}
            onTypingStart={onTypingStart}
            onTypingStop={onTypingStop}
          />
        ))
      )}
    </div>
  );
}

// ─── Recursive Node Component ──────────────────────────────

interface CommentNodeProps {
  node: MessageNode;
  depth: number;
  threadId: string;
  currentUser: {
    id: string;
    name: string | null;
    image: string | null;
    role?: string;
  };
  activeReplyId: string | null;
  collapsedIds: Set<string>;
  onReply: (messageId: string) => void;
  onCancelReply: () => void;
  onToggleCollapse: (messageId: string) => void;
  onMessagePosted: (message: Message) => void;
  onFocusBranch: (messageId: string) => void;
  onMessageUpdate: (messageId: string, updates: Partial<Message>) => void;
  allMessages: Message[];
  animateMessageId: string | null;
  aiInlineStatus: Record<string, 'pending' | 'failed'>;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
}

function CommentNode({
  node,
  depth,
  threadId,
  currentUser,
  activeReplyId,
  collapsedIds,
  onReply,
  onCancelReply,
  onToggleCollapse,
  onMessagePosted,
  onFocusBranch,
  onMessageUpdate,
  allMessages,
  animateMessageId,
  aiInlineStatus,
  onTypingStart,
  onTypingStop,
}: CommentNodeProps) {
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

  // Parent reference for "Replying to" context
  const parentMessage = node.parentId ? allMessages.find((m) => m.id === node.parentId) : null;

  const handleSaveEdit = useCallback(async () => {
    const trimmed = editContent.trim();
    if (!trimmed || trimmed === node.content) {
      return;
    }

    setIsSavingEdit(true);
    const res = await editMessage(node.id, trimmed);
    if (!res?.error) {
      onMessageUpdate(node.id, {
        content: trimmed,
        isEdited: true,
        updatedAt: new Date(),
      });
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
      {
        id: `${node.id}-current`,
        content: node.content,
        editedAt: node.updatedAt,
        isCurrent: true,
      },
      ...editHistory,
    ];
    return versions;
  }, [node.id, node.content, node.updatedAt, editHistory]);

  return (
    <div
      id={`message-${node.id}`}
      data-message-id={node.id}
      className={`relative group/branch ${
        shouldAnimate ? 'animate-in slide-in-from-top-1 fade-in duration-200' : ''
      }`}
      style={{ marginLeft: depth > 0 ? `${INDENT_PX}px` : 0 }}
    >
      {/* Left border line — clickable to collapse */}
      {depth > 0 && (
        <button
          onClick={() => onToggleCollapse(node.id)}
          className="absolute left-0 top-0 bottom-0 w-0.5 cursor-pointer z-10
                     bg-[rgba(55,54,252,0.15)] hover:bg-[rgba(55,54,252,0.4)]
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
                <AvatarImage src={parentMessage.sender.image || ''} />
                <AvatarFallback className="text-[7px]">
                  {parentMessage.sender.name?.substring(0, 1).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <span className="text-[11px] text-muted-foreground/70 truncate">
                <span className="font-medium text-foreground/60">
                  {parentMessage.sender.name || 'Anonymous'}
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
              <AvatarImage src={node.sender.image || ''} />
              <AvatarFallback className="bg-indigo-50 text-indigo-600 text-xs font-bold">
                {node.sender.name?.substring(0, 2).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground text-sm">
                  {node.sender.name || 'Anonymous'}
                </span>
                {isOwnMessage && (
                  <span className="bg-indigo-100 text-indigo-700 text-[9px] px-1.5 py-px rounded-full font-medium">
                    You
                  </span>
                )}
                {node.isAiResponse && (
                  <span className="bg-violet-100 text-violet-700 text-[9px] px-1.5 py-px rounded-full font-medium">
                    AI
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
                  {renderMentionContent(node.content)}
                </div>
              )}

              {aiStatus === 'pending' && !node.isAiResponse && (
                <p className="text-[11px] text-blue-600 mt-1">AI is thinking...</p>
              )}
              {aiStatus === 'failed' && !node.isAiResponse && (
                <p className="text-[11px] text-amber-600 mt-1">
                  AI couldn&apos;t process this. Try rephrasing your question.
                </p>
              )}

              {/* Attachments */}
              {node.attachments && node.attachments.length > 0 && !isEditing && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {node.attachments.map((file) => (
                    <AttachmentItem key={file.id} file={file} />
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
                    className={`flex items-center gap-1 transition-colors ${
                      isLiked ? 'text-amber-500' : 'text-muted-foreground/60 hover:text-amber-500'
                    }`}
                  >
                    <ThumbsUp size={13} className={isLiked ? 'fill-current' : ''} />
                    <span className="text-[11px] font-medium tabular-nums">
                      {likeCount > 0 ? likeCount : ''}
                    </span>
                  </button>

                  {!beyondDepthLimit && (
                    <button
                      onClick={() => onReply(node.id)}
                      className="flex items-center gap-1 text-muted-foreground/60 hover:text-indigo-500 transition-colors"
                    >
                      <Reply size={13} />
                      <span className="text-[11px] font-medium">Reply</span>
                    </button>
                  )}

                  {beyondDepthLimit && hasChildren && (
                    <button
                      onClick={() => onFocusBranch(node.id)}
                      className="flex items-center gap-1 text-indigo-500 hover:text-indigo-600 transition-colors"
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
                        className="text-muted-foreground/40 hover:text-muted-foreground transition-colors p-1 rounded opacity-0 group-hover/branch:opacity-100 focus-visible:opacity-100"
                        title="Edit message"
                      >
                        <Edit2 size={13} />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => setShowDeleteConfirm((prev) => !prev)}
                        disabled={isDeleting}
                        className="text-muted-foreground/40 hover:text-red-500 transition-colors p-1 rounded opacity-0 group-hover/branch:opacity-100 focus-visible:opacity-100"
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
                          // Optimistic
                          onMessageUpdate(node.id, { isPinned: !wasPinned });
                          const res = await pinMessage(node.id);
                          if (res?.error) {
                            onMessageUpdate(node.id, { isPinned: wasPinned });
                            toasts.error('Failed to pin message. Try again.');
                          }
                          setIsPinning(false);
                        }}
                        disabled={isPinning}
                        className={`transition-colors p-1 rounded opacity-0 group-hover/branch:opacity-100 focus-visible:opacity-100 ${node.isPinned ? 'text-indigo-500 opacity-100' : 'text-muted-foreground/40 hover:text-indigo-500'}`}
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
          onTypingStart={onTypingStart}
          onTypingStop={onTypingStop}
        />
      )}

      {/* Collapsed pill */}
      {hasChildren && isCollapsed && !beyondDepthLimit && (
        <button
          onClick={() => onToggleCollapse(node.id)}
          className="mt-1 ml-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full
                     bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400
                     text-[11px] font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-950/50
                     transition-colors cursor-pointer select-none"
        >
          <span>
            [+] {descendantCount} {descendantCount === 1 ? 'reply' : 'replies'}
          </span>
        </button>
      )}

      {/* Children (recursive) */}
      {hasChildren && !isCollapsed && !beyondDepthLimit && (
        <div
          className="mt-1 space-y-0 transition-all duration-300 ease-in-out overflow-hidden"
          style={{
            maxHeight: isCollapsed ? '0px' : '100000px',
          }}
        >
          {node.children.map((child) => (
            <CommentNode
              key={child.id}
              node={child}
              depth={depth + 1}
              threadId={threadId}
              currentUser={currentUser}
              activeReplyId={activeReplyId}
              collapsedIds={collapsedIds}
              onReply={onReply}
              onCancelReply={onCancelReply}
              onToggleCollapse={onToggleCollapse}
              onMessagePosted={onMessagePosted}
              onFocusBranch={onFocusBranch}
              onMessageUpdate={onMessageUpdate}
              allMessages={allMessages}
              animateMessageId={animateMessageId}
              aiInlineStatus={aiInlineStatus}
            />
          ))}
        </div>
      )}

      {/* "Continue this thread" for beyond depth limit */}
      {beyondDepthLimit && hasChildren && (
        <div className="mt-1 ml-4">
          <button
            onClick={() => onFocusBranch(node.id)}
            className="flex items-center gap-1.5 text-[12px] font-medium text-indigo-500 hover:text-indigo-600 transition-colors"
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
                  <div
                    key={version.id}
                    className="rounded-lg border border-border/60 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{version.isCurrent ? 'Current version' : 'Previous version'}</span>
                      <span>{formatEditedAt(version.editedAt)}</span>
                    </div>

                    <div className="rounded-md bg-muted/40 p-2 text-sm whitespace-pre-wrap">
                      {older ? (
                        <div className="space-y-1">
                          <p className="text-[11px] font-medium text-emerald-700">Additions</p>
                          <p>
                            {renderDiffLine(
                              version.content,
                              older.content,
                              'bg-emerald-100 text-emerald-800 rounded px-0.5'
                            )}
                          </p>
                          <p className="text-[11px] font-medium text-rose-700 pt-1">Removals</p>
                          <p>
                            {renderDiffLine(
                              older.content,
                              version.content,
                              'bg-rose-100 text-rose-700 rounded px-0.5 line-through'
                            )}
                          </p>
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
}

// ─── Deleted Message Placeholder ───────────────────────────

function DeletedMessagePlaceholder({
  originalContent,
  canViewOriginal,
}: {
  originalContent: string;
  canViewOriginal: boolean;
}) {
  const [showOriginal, setShowOriginal] = useState(false);

  return (
    <div className="py-2 flex items-start gap-3 opacity-70">
      <Avatar className="w-8 h-8 shrink-0 mt-0.5">
        <AvatarFallback className="bg-muted text-muted-foreground text-xs">?</AvatarFallback>
      </Avatar>

      <div className="space-y-1">
        <p className="text-sm text-muted-foreground italic">This message was removed</p>
        {canViewOriginal && (
          <>
            <button
              type="button"
              onClick={() => setShowOriginal((prev) => !prev)}
              className="text-[11px] text-indigo-600 hover:text-indigo-700 underline"
            >
              {showOriginal ? 'Hide original' : 'View original'}
            </button>
            {showOriginal && (
              <p className="text-xs text-foreground/70 blur-sm hover:blur-none transition">
                {originalContent}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Inline Reply Box ──────────────────────────────────────

interface InlineReplyBoxProps {
  parentMessage: MessageNode;
  threadId: string;
  currentUser: {
    id: string;
    name: string | null;
    image: string | null;
  };
  visualDepth: number;
  onCancel: () => void;
  onMessagePosted: (message: Message) => void;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
}

function InlineReplyBox({
  parentMessage,
  threadId,
  currentUser,
  visualDepth,
  onCancel,
  onMessagePosted,
  onTypingStart,
  onTypingStop,
}: InlineReplyBoxProps) {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const replyDepth = Math.min(parentMessage.depth + 1, MAX_VISUAL_DEPTH);

  // Auto-focus textarea when reply box opens
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  async function handleSubmit() {
    if (!content.trim()) {
      setError('Reply cannot be empty');
      return;
    }
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append('content', content);
    formData.append('sectionId', threadId);
    formData.append('parentId', parentMessage.id);
    formData.append('depth', String(replyDepth));

    const result = await postMessage(formData);
    setIsSubmitting(false);

    if (result?.error) {
      setError(result.error);
    } else if (result?.data?.message) {
      const data = result.data.message;
      const newMsg: Message = {
        id: data?.id ?? crypto.randomUUID(),
        content: data?.content ?? content,
        sectionId: data?.sectionId ?? threadId,
        senderId: data?.senderId ?? currentUser.id,
        parentId: parentMessage.id,
        depth: data?.depth ?? replyDepth,
        isEdited: false,
        isPinned: false,
        likeCount: 0,
        replyCount: 0,
        isAiResponse: false,
        createdAt: data?.createdAt ? new Date(data.createdAt) : new Date(),
        updatedAt: data?.updatedAt ? new Date(data.updatedAt) : new Date(),
        deletedAt: null,
        sender: data?.sender
          ? {
              id: data.sender.id,
              name: data.sender.name,
              image: data.sender.image,
            }
          : {
              id: currentUser.id,
              name: currentUser.name,
              image: currentUser.image,
            },
        section: data?.section
          ? {
              id: data.section.id,
              name: data.section.name,
              slug: data.section.slug,
            }
          : { id: threadId, name: '', slug: '' },
        attachments:
          data?.attachments?.map(
            (att: {
              id: string;
              url: string;
              type: string;
              name: string | null;
              size: bigint | null;
            }) => ({
              id: att.id,
              url: att.url,
              type: att.type,
              name: att.name,
              size: att.size !== null ? Number(att.size) : null,
            })
          ) ?? [],
      };

      onMessagePosted(newMsg);
      toasts.sent();
      router.refresh();
    }
  }

  return (
    <div
      className="mt-2 animate-in slide-in-from-top-1 fade-in duration-200"
      style={{ marginLeft: visualDepth > 0 ? `${INDENT_PX}px` : 0 }}
    >
      <div className="border border-indigo-200/50 dark:border-indigo-800/30 rounded-xl p-3 bg-indigo-50/30 dark:bg-indigo-950/10">
        {/* "Replying to @username" header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Reply size={11} />
            <span>Replying to</span>
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">
              @{parentMessage.sender.name || 'Anonymous'}
            </span>
          </div>
          <button
            onClick={onCancel}
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex gap-2.5">
          <Avatar className="w-7 h-7 shrink-0 mt-0.5">
            <AvatarImage src={currentUser.image || ''} />
            <AvatarFallback className="text-[9px] bg-indigo-100 text-indigo-600">
              {currentUser.name?.substring(0, 2).toUpperCase() || 'ME'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setError(null);
                onTypingStart?.();
              }}
              placeholder="Write your reply…"
              className="min-h-[60px] max-h-[200px] text-sm resize-none shadow-none border-0 bg-transparent p-0 focus-visible:ring-0"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleSubmit();
                  onTypingStop?.();
                }
                if (e.key === 'Escape') {
                  onCancel();
                  onTypingStop?.();
                } else {
                  onTypingStart?.();
                }
              }}
              onBlur={() => onTypingStop?.()}
            />

            {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}

            <div className="flex items-center justify-end gap-2 mt-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancel}
                className="h-7 text-xs text-muted-foreground"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={isSubmitting || !content.trim()}
                className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                {isSubmitting ? 'Posting...' : 'Reply'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Attachment Renderer ───────────────────────────────────

function AttachmentItem({ file }: { file: Attachment }) {
  const isImage =
    file.type === 'IMAGE' || (file.type && (file.type.startsWith('image/') || file.type === 'GIF'));

  if (isImage) {
    return (
      <div className="relative group overflow-hidden rounded-lg border">
        <Image
          src={file.url}
          alt={file.name || 'attachment'}
          width={200}
          height={150}
          className="max-w-[200px] max-h-[150px] object-cover hover:scale-105 transition-transform duration-300"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border transition-colors group">
      <div className="p-1.5 rounded-md border shadow-sm text-muted-foreground">
        <FileIcon size={14} />
      </div>
      <div className="max-w-[120px]">
        <p className="text-xs font-medium text-foreground truncate">{file.name || 'File'}</p>
        <p className="text-[10px] text-muted-foreground">
          {file.type?.split('/').pop()?.toUpperCase()}
        </p>
      </div>
      <a
        href={file.url}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-1 p-1.5 rounded-full transition-all opacity-0 group-hover:opacity-100"
      >
        <Download size={12} />
      </a>
    </div>
  );
}

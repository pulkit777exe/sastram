"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Reply,
  FileIcon,
  Download,
  ThumbsUp,
  ArrowRight,
  Plus,
  X,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Message, Attachment } from "@/lib/types/index";
import type { MessageNode } from "@/modules/messages/types";
import {
  buildMessageTree,
  countDescendants,
  loadCollapseStates,
  saveCollapseState,
} from "@/modules/messages/service";
import { postMessage } from "@/modules/messages/actions";
import { toggleReaction } from "@/modules/reactions/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ReportButton } from "./report-button";
import { AppealMessageModal } from "./appeal-message-modal";
import Image from "next/image";

const MAX_VISUAL_DEPTH = 4;
const INDENT_PX = 20;

// ─── Main Component ────────────────────────────────────────

interface CommentTreeProps {
  messages: Message[];
  sectionId: string;
  currentUser: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

export function CommentTree({
  messages,
  sectionId,
  currentUser,
}: CommentTreeProps) {
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [localMessages, setLocalMessages] = useState<Message[]>(messages);

  // Load collapse states from localStorage on mount
  useEffect(() => {
    const states = loadCollapseStates(sectionId);
    const collapsed = new Set<string>();
    states.forEach((isCollapsed, messageId) => {
      if (isCollapsed) collapsed.add(messageId);
    });
    setCollapsedIds(collapsed);
  }, [sectionId]);

  // Sync messages prop
  useEffect(() => {
    setLocalMessages(messages);
  }, [messages]);

  // Build tree from flat messages — memoized
  const tree = useMemo(() => buildMessageTree(localMessages), [localMessages]);

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
        saveCollapseState(sectionId, messageId, !isCollapsed);
        return next;
      });
    },
    [sectionId],
  );

  const handleReply = useCallback((messageId: string) => {
    // Only one reply box at a time
    setActiveReplyId((prev) => (prev === messageId ? null : messageId));
  }, []);

  const handleCancelReply = useCallback(() => {
    setActiveReplyId(null);
  }, []);

  const handleMessagePosted = useCallback((newMessage: Message) => {
    setLocalMessages((prev) => [...prev, newMessage]);
    setActiveReplyId(null);
  }, []);

  if (tree.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {tree.map((node) => (
        <CommentNode
          key={node.id}
          node={node}
          depth={0}
          sectionId={sectionId}
          currentUser={currentUser}
          activeReplyId={activeReplyId}
          collapsedIds={collapsedIds}
          onReply={handleReply}
          onCancelReply={handleCancelReply}
          onToggleCollapse={toggleCollapse}
          onMessagePosted={handleMessagePosted}
          allMessages={localMessages}
        />
      ))}
    </div>
  );
}

// ─── Recursive Node Component ──────────────────────────────

interface CommentNodeProps {
  node: MessageNode;
  depth: number;
  sectionId: string;
  currentUser: {
    id: string;
    name: string | null;
    image: string | null;
  };
  activeReplyId: string | null;
  collapsedIds: Set<string>;
  onReply: (messageId: string) => void;
  onCancelReply: () => void;
  onToggleCollapse: (messageId: string) => void;
  onMessagePosted: (message: Message) => void;
  allMessages: Message[];
}

function CommentNode({
  node,
  depth,
  sectionId,
  currentUser,
  activeReplyId,
  collapsedIds,
  onReply,
  onCancelReply,
  onToggleCollapse,
  onMessagePosted,
  allMessages,
}: CommentNodeProps) {
  const [appealOpen, setAppealOpen] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(node.likeCount ?? 0);
  const [isLiking, setIsLiking] = useState(false);

  const isCollapsed = collapsedIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const isOwnMessage = node.senderId === currentUser.id;
  const isShowingReplyBox = activeReplyId === node.id;
  const isDeleted = !!node.deletedAt;
  const beyondDepthLimit = depth >= MAX_VISUAL_DEPTH;
  const descendantCount = countDescendants(node);

  // Parent reference for "Replying to" context
  const parentMessage = node.parentId
    ? allMessages.find((m) => m.id === node.parentId)
    : null;

  return (
    <div
      className="relative group/branch"
      style={{ marginLeft: depth > 0 ? `${INDENT_PX}px` : 0 }}
    >
      {/* Left border line — clickable to collapse */}
      {depth > 0 && (
        <button
          onClick={() => onToggleCollapse(node.id)}
          className="absolute left-0 top-0 bottom-0 w-[2px] cursor-pointer z-10
                     bg-[rgba(55,54,252,0.15)] hover:bg-[rgba(55,54,252,0.4)]
                     transition-colors duration-150 rounded-full"
          style={{ marginLeft: "-11px" }}
          aria-label={isCollapsed ? "Expand thread" : "Collapse thread"}
        />
      )}

      {/* Message Card */}
      {isDeleted ? (
        <DeletedMessagePlaceholder />
      ) : (
        <div className="py-2">
          {/* Reply reference */}
          {parentMessage && depth > 0 && (
            <div className="flex items-center gap-2 mb-1.5 pl-1">
              <Reply size={11} className="text-muted-foreground/60 shrink-0" />
              <Avatar className="w-3.5 h-3.5 shrink-0">
                <AvatarImage src={parentMessage.sender.image || ""} />
                <AvatarFallback className="text-[7px]">
                  {parentMessage.sender.name?.substring(0, 1).toUpperCase() ||
                    "U"}
                </AvatarFallback>
              </Avatar>
              <span className="text-[11px] text-muted-foreground/70 truncate">
                <span className="font-medium text-foreground/60">
                  {parentMessage.sender.name || "Anonymous"}
                </span>
                <span className="mx-1">·</span>
                <span className="truncate max-w-[180px] inline-block align-bottom">
                  {parentMessage.content.slice(0, 45)}
                  {parentMessage.content.length > 45 ? "…" : ""}
                </span>
              </span>
            </div>
          )}

          <div className="flex items-start gap-3">
            <Avatar className="w-8 h-8 shrink-0 border border-border/40">
              <AvatarImage src={node.sender.image || ""} />
              <AvatarFallback className="bg-indigo-50 text-indigo-600 text-xs font-bold">
                {node.sender.name?.substring(0, 2).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground text-sm">
                  {node.sender.name || "Anonymous"}
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
                {node.isPinned && (
                  <span className="text-amber-500 text-[10px]">📌</span>
                )}
                <span className="text-[11px] text-muted-foreground/60 font-medium">
                  {formatDistanceToNow(new Date(node.createdAt), {
                    addSuffix: false,
                  })}{" "}
                  ago
                </span>
                {node.isEdited && (
                  <span className="text-[10px] text-muted-foreground/50">
                    (edited)
                  </span>
                )}
              </div>

              <div className="text-foreground/80 text-[14px] leading-relaxed whitespace-pre-wrap wrap-break-word">
                {node.content}
              </div>

              {/* Attachments */}
              {node.attachments && node.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {node.attachments.map((file) => (
                    <AttachmentItem key={file.id} file={file} />
                  ))}
                </div>
              )}

              {/* Action bar */}
              <div className="flex items-center gap-3 pt-1.5">
                <button
                  onClick={async () => {
                    if (isLiking) return;
                    setIsLiking(true);
                    const wasLiked = isLiked;
                    setIsLiked(!wasLiked);
                    setLikeCount((prev) =>
                      wasLiked ? Math.max(0, prev - 1) : prev + 1,
                    );

                    const result = await toggleReaction(node.id, "👍");
                    if (result && "error" in result) {
                      setIsLiked(wasLiked);
                      setLikeCount((prev) =>
                        wasLiked ? prev + 1 : Math.max(0, prev - 1),
                      );
                      toast.error("Failed to update like");
                    }
                    setIsLiking(false);
                  }}
                  disabled={isLiking}
                  className={`flex items-center gap-1 transition-colors ${
                    isLiked
                      ? "text-amber-500"
                      : "text-muted-foreground/60 hover:text-amber-500"
                  }`}
                >
                  <ThumbsUp
                    size={13}
                    className={isLiked ? "fill-current" : ""}
                  />
                  <span className="text-[11px] font-medium tabular-nums">
                    {likeCount > 0 ? likeCount : ""}
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
                    onClick={() => {
                      // TODO: Open focused thread view
                      toast.info("Continue thread view coming soon");
                    }}
                    className="flex items-center gap-1 text-indigo-500 hover:text-indigo-600 transition-colors"
                  >
                    <span className="text-[11px] font-medium">
                      Continue this thread
                    </span>
                    <ArrowRight size={12} />
                  </button>
                )}

                <ReportButton messageId={node.id} />

                <button
                  onClick={() => setAppealOpen(true)}
                  className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground hover:underline transition-colors"
                >
                  Appeal
                </button>

                {hasChildren && (
                  <span className="text-[10px] text-muted-foreground/40 tabular-nums ml-auto">
                    {descendantCount}{" "}
                    {descendantCount === 1 ? "reply" : "replies"}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inline reply box */}
      {isShowingReplyBox && !beyondDepthLimit && (
        <InlineReplyBox
          parentMessage={node}
          sectionId={sectionId}
          currentUser={currentUser}
          depth={depth + 1}
          onCancel={onCancelReply}
          onMessagePosted={onMessagePosted}
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
          <Plus size={11} />
          <span>
            {descendantCount} {descendantCount === 1 ? "reply" : "replies"}
          </span>
        </button>
      )}

      {/* Children (recursive) */}
      {hasChildren && !isCollapsed && !beyondDepthLimit && (
        <div
          className="mt-1 space-y-0 transition-all duration-300 ease-in-out overflow-hidden"
          style={{
            maxHeight: isCollapsed ? "0px" : "100000px",
          }}
        >
          {node.children.map((child) => (
            <CommentNode
              key={child.id}
              node={child}
              depth={depth + 1}
              sectionId={sectionId}
              currentUser={currentUser}
              activeReplyId={activeReplyId}
              collapsedIds={collapsedIds}
              onReply={onReply}
              onCancelReply={onCancelReply}
              onToggleCollapse={onToggleCollapse}
              onMessagePosted={onMessagePosted}
              allMessages={allMessages}
            />
          ))}
        </div>
      )}

      {/* "Continue this thread" for beyond depth limit */}
      {beyondDepthLimit && hasChildren && (
        <div className="mt-1 ml-4">
          <button
            onClick={() => toast.info("Continue thread view coming soon")}
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
    </div>
  );
}

// ─── Deleted Message Placeholder ───────────────────────────

function DeletedMessagePlaceholder() {
  return (
    <div className="py-2 flex items-center gap-3 opacity-50">
      <Avatar className="w-8 h-8 shrink-0">
        <AvatarFallback className="bg-muted text-muted-foreground text-xs">
          ?
        </AvatarFallback>
      </Avatar>
      <span className="text-sm text-muted-foreground italic">
        [This message was removed]
      </span>
    </div>
  );
}

// ─── Inline Reply Box ──────────────────────────────────────

interface InlineReplyBoxProps {
  parentMessage: MessageNode;
  sectionId: string;
  currentUser: {
    id: string;
    name: string | null;
    image: string | null;
  };
  depth: number;
  onCancel: () => void;
  onMessagePosted: (message: Message) => void;
}

function InlineReplyBox({
  parentMessage,
  sectionId,
  currentUser,
  depth,
  onCancel,
  onMessagePosted,
}: InlineReplyBoxProps) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  // Auto-focus textarea when reply box opens
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  async function handleSubmit() {
    if (!content.trim()) {
      setError("Reply cannot be empty");
      return;
    }
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("content", content);
    formData.append("sectionId", sectionId);
    formData.append("parentId", parentMessage.id);

    const result = await postMessage(formData);
    setIsSubmitting(false);

    if (result && "error" in result && result.error) {
      setError(result.error);
    } else if (result && "success" in result && result.success) {
      const data = result.data;
      const newMsg: Message = {
        id: data?.id ?? crypto.randomUUID(),
        content: data?.content ?? content,
        sectionId: data?.sectionId ?? sectionId,
        senderId: data?.senderId ?? currentUser.id,
        parentId: parentMessage.id,
        depth: Math.min(depth, MAX_VISUAL_DEPTH),
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
          : { id: sectionId, name: "", slug: "" },
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
            }),
          ) ?? [],
      };

      onMessagePosted(newMsg);
      toast.success("Reply posted!");
      router.refresh();
    }
  }

  return (
    <div
      className="mt-2 animate-in slide-in-from-top-1 fade-in duration-200"
      style={{ marginLeft: `${INDENT_PX}px` }}
    >
      <div className="border border-indigo-200/50 dark:border-indigo-800/30 rounded-xl p-3 bg-indigo-50/30 dark:bg-indigo-950/10">
        {/* "Replying to @username" header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Reply size={11} />
            <span>Replying to</span>
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">
              @{parentMessage.sender.name || "Anonymous"}
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
            <AvatarImage src={currentUser.image || ""} />
            <AvatarFallback className="text-[9px] bg-indigo-100 text-indigo-600">
              {currentUser.name?.substring(0, 2).toUpperCase() || "ME"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setError(null);
              }}
              placeholder="Write your reply…"
              className="min-h-[60px] max-h-[200px] text-sm resize-none shadow-none border-0 bg-transparent p-0 focus-visible:ring-0"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleSubmit();
                }
                if (e.key === "Escape") {
                  onCancel();
                }
              }}
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
                {isSubmitting ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : null}
                {isSubmitting ? "Posting..." : "Reply"}
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
    file.type === "IMAGE" ||
    (file.type && (file.type.startsWith("image/") || file.type === "GIF"));

  if (isImage) {
    return (
      <div className="relative group overflow-hidden rounded-lg border">
        <Image
          src={file.url}
          alt={file.name || "attachment"}
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
        <p className="text-xs font-medium text-foreground truncate">
          {file.name || "File"}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {file.type?.split("/").pop()?.toUpperCase()}
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

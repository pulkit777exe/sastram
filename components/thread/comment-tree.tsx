"use client";

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Reply,
  ChevronDown,
  ChevronRight,
  FileIcon,
  Download,
  ThumbsUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Message, Attachment } from "@/lib/types/index";
import { postMessage } from "@/modules/messages/actions";
import { toggleReaction } from "@/modules/reactions/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ReportButton } from "./report-button";
import { AppealMessageModal } from "./appeal-message-modal";
import Image from "next/image";

interface CommentTreeProps {
  messages: Message[];
  sectionId: string;
  currentUser: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

interface CommentItemProps {
  message: Message;
  allMessages: Message[];
  sectionId: string;
  currentUser: {
    id: string;
    name: string | null;
    image: string | null;
  };
  depth: number;
  isLast?: boolean;
}

const MAX_DEPTH = 6;
const INITIAL_REPLIES_TO_SHOW = 3;

export function CommentTree({
  messages,
  sectionId,
  currentUser,
}: CommentTreeProps) {
  const messageMap = new Map<string, Message[]>();

  messages.forEach((msg) => {
    const parentId = msg.parentId || "root";
    if (!messageMap.has(parentId)) {
      messageMap.set(parentId, []);
    }
    messageMap.get(parentId)!.push(msg);
  });

  messageMap.forEach((msgs) => {
    msgs.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  });

  const rootMessages = messageMap.get("root") || [];

  return (
    <div className="space-y-6">
      {rootMessages.map((message) => (
        <CommentItem
          key={message.id}
          message={message}
          allMessages={messages}
          sectionId={sectionId}
          currentUser={currentUser}
          depth={0}
        />
      ))}
    </div>
  );
}

function CommentItem({
  message,
  allMessages,
  sectionId,
  currentUser,
  depth,
  isLast,
}: CommentItemProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [showAllReplies, setShowAllReplies] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [appealOpen, setAppealOpen] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [isLiking, setIsLiking] = useState(false);
  const router = useRouter();

  const replies = allMessages.filter((m) => m.parentId === message.id);
  const hasReplies = replies.length > 0;
  const isOwnMessage = message.senderId === currentUser.id;
  const canReply = depth < MAX_DEPTH;

  const parentMessage = message.parentId
    ? allMessages.find((m) => m.id === message.parentId)
    : null;
  const isReplyToCurrentUser = parentMessage?.senderId === currentUser.id;

  const shouldShowMoreButton = replies.length > INITIAL_REPLIES_TO_SHOW;
  const displayedReplies = showAllReplies
    ? replies
    : replies.slice(0, INITIAL_REPLIES_TO_SHOW);
  const hiddenRepliesCount = replies.length - INITIAL_REPLIES_TO_SHOW;

  async function handleReply() {
    if (!replyContent.trim()) {
      toast.error("Reply cannot be empty");
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("content", replyContent);
    formData.append("sectionId", sectionId);
    formData.append("parentId", message.id);

    const result = await postMessage(formData);
    setIsSubmitting(false);

    if (result && "error" in result && result.error) {
      toast.error(result.error);
    } else if (result && "success" in result && result.success) {
      toast.success("Reply posted!");
      setReplyContent("");
      setIsReplying(false);
      router.refresh();
    }
  }

  return (
    <div className="relative">
      {depth > 0 && (
        <div className="absolute -left-[34px] top-0 bottom-0 w-[34px] pointer-events-none">
          <div className="absolute -top-2.5 left-0 h-[42px] w-px" />

          <div className="absolute top-8 left-0 w-[34px] h-px" />

          <div className="absolute top-2.5 left-0 w-4 h-6 border-l border-b rounded-bl-xl" />
        </div>
      )}

      <div
        className={`border shadow-sm rounded-2xl p-5 relative group transition-all hover:shadow-md ${isReplyToCurrentUser ? "bg-yellow-50/60 dark:bg-yellow-900/10 border-yellow-200/50 dark:border-yellow-700/30" : ""}`}
      >
        {/* Discord-style reply reference */}
        {parentMessage && (
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
            <Reply size={12} className="text-muted-foreground shrink-0" />
            <Avatar className="w-4 h-4 shrink-0">
              <AvatarImage src={parentMessage.sender.image || ""} />
              <AvatarFallback className="text-[8px]">
                {parentMessage.sender.name?.substring(0, 1).toUpperCase() ||
                  "U"}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground truncate">
              <span className="font-medium text-foreground/80">
                {parentMessage.sender.name || "Anonymous"}
              </span>
              <span className="mx-1">·</span>
              <span className="truncate max-w-[200px] inline-block align-bottom">
                {parentMessage.content.slice(0, 50)}
                {parentMessage.content.length > 50 ? "..." : ""}
              </span>
            </span>
          </div>
        )}

        <div className="flex items-start gap-4">
          <Avatar className="w-10 h-10 shrink-0 border border-zinc-100">
            <AvatarImage src={message.sender.image || ""} />
            <AvatarFallback className="bg-indigo-50 text-indigo-600 text-sm font-bold">
              {message.sender.name?.substring(0, 2).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-zinc-900 text-sm">
                  {message.sender.name || "Anonymous"}
                </span>
                {isOwnMessage && (
                  <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full font-medium">
                    You
                  </span>
                )}
              </div>
              <span className="text-[11px] font-medium uppercase tracking-wide">
                {formatDistanceToNow(new Date(message.createdAt), {
                  addSuffix: false,
                })}{" "}
                ago
              </span>
            </div>

            <div className="text-zinc-600 text-[15px] leading-relaxed whitespace-pre-wrap warp-break-word">
              {message.content}
            </div>

            {message.attachments && message.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3 mb-2">
                {message.attachments.map((file) => (
                  <AttachmentItem key={file.id} file={file} />
                ))}
              </div>
            )}

            <div className="flex items-center gap-4 pt-2 mt-1">
              <button
                onClick={async () => {
                  if (isLiking) return;
                  setIsLiking(true);
                  const wasLiked = isLiked;
                  setIsLiked(!wasLiked);
                  setLikeCount((prev) =>
                    wasLiked ? Math.max(0, prev - 1) : prev + 1,
                  );

                  const result = await toggleReaction(message.id, "👍");

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
                className={`flex items-center gap-1.5 transition-colors group/like ${isLiked ? "text-amber-500" : "hover:text-amber-500"}`}
              >
                <div
                  className={`p-1.5 rounded-full ${isLiked ? "bg-amber-100" : "group-hover/like:bg-amber-50"}`}
                >
                  <ThumbsUp
                    size={14}
                    className={isLiked ? "fill-current" : ""}
                  />
                </div>
                <span className="text-xs font-medium">
                  {likeCount > 0 ? likeCount : "Like"}
                </span>
              </button>

              {canReply && (
                <button
                  onClick={() => setIsReplying(!isReplying)}
                  className="flex items-center gap-1.5 hover:text-indigo-600 transition-colors group/reply"
                >
                  <div className="p-1.5 rounded-full group-hover/reply:bg-indigo-50">
                    <Reply size={14} />
                  </div>
                  <span className="text-xs font-medium">Reply</span>
                </button>
              )}

              <ReportButton messageId={message.id} />

              <button
                onClick={() => setAppealOpen(true)}
                className="text-[11px] hover:underline"
              >
                Appeal
              </button>
            </div>
          </div>
        </div>
      </div>

      {isReplying && (
        <div className="mt-4 ml-8 relative pl-6 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="absolute left-0 -top-5 bottom-1/2 w-6 border-l border-b rounded-bl-xl" />

          <div className="border rounded-xl p-3 flex gap-3">
            <Avatar className="w-8 h-8 shrink-0">
              <AvatarImage src={currentUser.image || ""} />
              <AvatarFallback className="text-xs">ME</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <Textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Write your reply..."
                className="min-h-20 text-sm focus-visible:ring-indigo-500/20 resize-none shadow-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    handleReply();
                  }
                }}
              />
              <div className="flex items-center justify-end gap-2 mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsReplying(false)}
                  className="h-8 text-zinc-500 hover:text-zinc-900"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleReply}
                  disabled={isSubmitting || !replyContent.trim()}
                  className="h-8"
                >
                  {isSubmitting ? "Sending..." : "Post Reply"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AppealMessageModal
        messageId={message.id}
        isOpen={appealOpen}
        onClose={() => setAppealOpen(false)}
      />

      {hasReplies && isExpanded && (
        <div className="mt-4 ml-10 space-y-4 relative">
          <div className="absolute -left-1.5 top-5 bottom-6 w-px" />

          {displayedReplies.map((reply, index) => (
            <CommentItem
              key={reply.id}
              message={reply}
              allMessages={allMessages}
              sectionId={sectionId}
              currentUser={currentUser}
              depth={depth + 1}
              isLast={index === displayedReplies.length - 1}
            />
          ))}

          {shouldShowMoreButton && (
            <div className="relative pl-6 pt-2">
              <div className="absolute -left-1.5 -top-2.5 h-[26px] w-4 border-l border-b rounded-bl-xl" />
              <button
                onClick={() => setShowAllReplies(!showAllReplies)}
                className="text-xs font-bold text-indigo-500 hover:text-indigo-600 flex items-center gap-1 px-3 py-1.5 rounded-full transition-colors"
              >
                {showAllReplies ? (
                  <>
                    Show less <ChevronDown size={12} />
                  </>
                ) : (
                  <>
                    Show {hiddenRepliesCount} more replies{" "}
                    <ChevronRight size={12} />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
      <div className="p-1.5 rounded-md border shadow-sm text-zinc-500">
        <FileIcon size={14} />
      </div>
      <div className="max-w-[120px]">
        <p className="text-xs font-medium text-zinc-700 truncate">
          {file.name || "File"}
        </p>
        <p className="text-[10px] text-zinc-400">
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

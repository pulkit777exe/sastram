"use client";

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Reply, ChevronDown, ChevronRight, FileIcon, Download, Image as ImageIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Message, Attachment } from "@/lib/types/index";
import { postMessage } from "@/modules/messages/actions";
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
  parentMessage?: Message | null;
}

const MAX_DEPTH = 6;
const INITIAL_REPLIES_TO_SHOW = 3; // Show first 3 replies by default

export function CommentTree({ messages, sectionId, currentUser }: CommentTreeProps) {
  const messageMap = new Map<string, Message[]>();
  
  messages.forEach((msg) => {
    const parentId = msg.parentId || "root";
    if (!messageMap.has(parentId)) {
      messageMap.set(parentId, []);
    }
    messageMap.get(parentId)!.push(msg);
  });

  // Sort all messages by creation time
  messageMap.forEach((msgs) => {
    msgs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  });

  const rootMessages = messageMap.get("root") || [];

  return (
    <div className="space-y-4">
      {rootMessages.map((message) => (
        <CommentItem
          key={message.id}
          message={message}
          allMessages={messages}
          sectionId={sectionId}
          currentUser={currentUser}
          depth={0}
          parentMessage={null}
        />
      ))}
    </div>
  );
}

function CommentItem({ message, allMessages, sectionId, currentUser, depth, parentMessage }: CommentItemProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [showAllReplies, setShowAllReplies] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [appealOpen, setAppealOpen] = useState(false);
  const router = useRouter();

  // Find direct replies to this message
  const replies = allMessages.filter((m) => m.parentId === message.id);
  const hasReplies = replies.length > 0;
  const isOwnMessage = message.senderId === currentUser.id;
  const canReply = depth < MAX_DEPTH;
  
  // For "Show more" functionality
  const shouldShowMoreButton = replies.length > INITIAL_REPLIES_TO_SHOW;
  const displayedReplies = showAllReplies ? replies : replies.slice(0, INITIAL_REPLIES_TO_SHOW);
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

  // Truncate long content for preview
  const MAX_PREVIEW_LENGTH = 150;
  const shouldTruncate = parentMessage && parentMessage.content.length > MAX_PREVIEW_LENGTH;
  const previewContent = shouldTruncate 
    ? parentMessage.content.substring(0, MAX_PREVIEW_LENGTH) + "..."
    : parentMessage?.content || "";

  return (
    <div className="flex gap-3">
      {/* Reddit-style vertical line for nested comments */}
      {depth > 0 && (
        <div className="flex flex-col items-center pt-1 min-w-[24px]">
          {/* Top connector line */}
          <div className="w-px h-3 bg-zinc-700" />
          {/* Horizontal branch line */}
          <div className="w-4 h-px bg-zinc-700" />
          {/* Vertical line that extends down */}
          <div className="w-px flex-1 bg-zinc-700 min-h-[20px]" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        {/* Parent message preview (Reddit-style) */}
        {parentMessage && (
          <div className="mb-2 ml-1 pl-3 border-l-2 border-indigo-500/40 bg-zinc-900/40 rounded-r-md py-2 pr-2 hover:bg-zinc-900/50 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-indigo-400">
                {parentMessage.sender.name || "Anonymous"}
              </span>
              <span className="text-[10px] text-zinc-500">
                {formatDistanceToNow(new Date(parentMessage.createdAt), { addSuffix: true })}
              </span>
            </div>
            <p className="text-xs text-zinc-400 line-clamp-2">
              {previewContent}
            </p>
          </div>
        )}

        {/* Comment */}
        <div className="group hover:bg-zinc-800/50 rounded-lg p-3 transition-colors">
          <div className="flex items-start gap-3">
            <Avatar className="w-8 h-8 shrink-0">
              <AvatarImage src={message.sender.image || ""} />
              <AvatarFallback className="bg-indigo-500/20 text-indigo-400 text-xs">
                {message.sender.name?.substring(0, 2).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-sm text-white">
                  {message.sender.name || "Anonymous"}
                </span>
                {isOwnMessage && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400">
                    you
                  </span>
                )}
                <span className="text-xs text-zinc-500">
                  {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                </span>
              </div>

              <div className="text-sm text-zinc-300 whitespace-pre-wrap break-words">
                {message.content}
              </div>

              {/* Attachments */}
              {message.attachments && message.attachments.length > 0 && (
                <div className={`flex flex-wrap gap-2 mt-2 ${message.content ? "" : ""}`}>
                  {message.attachments.map((file) => (
                    <AttachmentItem key={file.id} file={file} />
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-4 mt-2">
                {canReply && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsReplying(!isReplying)}
                    className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                  >
                    <Reply className="w-3 h-3 mr-1" />
                    Reply
                  </Button>
                )}
                {hasReplies && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3 mr-1" />
                    ) : (
                      <ChevronRight className="w-3 h-3 mr-1" />
                    )}
                    {replies.length} {replies.length === 1 ? "reply" : "replies"}
                  </Button>
                )}
                <ReportButton messageId={message.id} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAppealOpen(true)}
                  className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                >
                  Appeal
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Reply form */}
        {isReplying && (
          <div className="ml-11 mt-3">
            <div className="flex gap-2">
              <Avatar className="w-6 h-6 shrink-0">
                <AvatarImage src={currentUser.image || ""} />
                <AvatarFallback className="bg-indigo-500/20 text-indigo-400 text-[10px]">
                  {currentUser.name?.substring(0, 2).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <Textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="Write a reply..."
                  className="min-h-[80px] bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 resize-none"
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
                    onClick={() => {
                      setIsReplying(false);
                      setReplyContent("");
                    }}
                    className="text-zinc-400 hover:text-zinc-200"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleReply}
                    disabled={isSubmitting || !replyContent.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white"
                  >
                    {isSubmitting ? "Posting..." : "Reply"}
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

        {/* Nested replies */}
        {hasReplies && isExpanded && (
          <div className="mt-3 space-y-4">
            {displayedReplies.map((reply) => {
              // Find parent message for this reply
              const replyParent = allMessages.find((m) => m.id === reply.parentId);
              return (
                <CommentItem
                  key={reply.id}
                  message={reply}
                  allMessages={allMessages}
                  sectionId={sectionId}
                  currentUser={currentUser}
                  depth={depth + 1}
                  parentMessage={replyParent || null}
                />
              );
            })}
            
            {/* Show more / Show less button */}
            {shouldShowMoreButton && (
              <div className="ml-4">
                <span
                  onClick={() => setShowAllReplies(!showAllReplies)}
                  className="cursor-pointer text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors px-2 py-1 rounded hover:bg-indigo-500/10 inline-block"
                >
                  {showAllReplies ? (
                    <span>Show less</span>
                  ) : (
                    <span>Show {hiddenRepliesCount} more {hiddenRepliesCount === 1 ? "reply" : "replies"}</span>
                  )}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AttachmentItem({ file }: { file: Attachment }) {
  const isImage = file.type === "IMAGE" || (file.type && (file.type.startsWith("image/") || file.type === "GIF"));

  if (isImage) {
    return (
      <div className="relative group overflow-hidden rounded-lg mt-1 max-w-full">
        <Image 
          src={file.url} 
          alt={file.name || "attachment"} 
          width={400}
          height={300}
          className="max-w-full md:max-w-sm lg:max-w-md max-h-[300px] object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
        />
      </div>
    );
  }

  const formatBytes = (bytes: number | null | undefined, decimals = 2) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const fileType = file.type?.split('/').pop()?.toUpperCase() || 'FILE';

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-md max-w-full bg-zinc-800/50 border border-zinc-700 hover:bg-zinc-800 transition-colors">
      <div className="p-2 bg-zinc-900/50 rounded-md">
        <FileIcon className="w-5 h-5 text-zinc-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-300 truncate max-w-[200px] hover:text-zinc-200 cursor-pointer">
          {file.name || "File"}
        </p>
        <p className="text-xs text-zinc-500">
          {fileType} {file.size ? `· ${formatBytes(file.size)}` : ''}
        </p>
      </div>
      <a 
        href={file.url} 
        target="_blank" 
        rel="noopener noreferrer" 
        className="p-1.5 text-zinc-400 hover:text-zinc-300 rounded-full transition-colors hover:bg-zinc-700/50"
      >
        <Download className="w-4 h-4" />
      </a>
    </div>
  );
}

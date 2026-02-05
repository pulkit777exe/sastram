"use client";

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FileIcon, Download, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Message, Attachment } from "@/lib/types/index";
import Image from "next/image";

interface MessageListProps {
  messages: Message[];
  currentUser: {
    id: string;
  };
  onReply?: (parentMessageId: string) => void;
}

export function MessageList({ messages, currentUser, onReply }: MessageListProps) {
  // Organize messages into threads
  const { topLevelMessages, repliesMap } = organizeThreads(messages);

  return (
    <div className="flex flex-col py-2 px-2 space-y-4">
      {topLevelMessages.map((message) => (
        <ThreadMessage
          key={message.id}
          message={message}
          replies={repliesMap.get(message.id) || []}
          currentUser={currentUser}
          onReply={onReply}
          allReplies={repliesMap}
        />
      ))}
    </div>
  );
}

interface ThreadMessageProps {
  message: Message;
  replies: Message[];
  currentUser: { id: string };
  onReply?: (parentMessageId: string) => void;
  allReplies: Map<string, Message[]>;
  isNested?: boolean;
}

function ThreadMessage({ 
  message, 
  replies, 
  currentUser, 
  onReply, 
  allReplies,
  isNested = false 
}: ThreadMessageProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const hasReplies = replies.length > 0;
  const replyCount = countAllReplies(message.id, allReplies);

  // Skip deleted messages (soft delete)
  if (message.deletedAt) {
    return (
      <div className="flex gap-4 w-full pl-0 py-1">
        {isNested && (
          <div className="absolute left-[20px] top-0 bottom-0 w-[2px] bg-[#3f4147] rounded-full" />
        )}
        <Avatar className="w-10 h-10 mt-0.5 shrink-0 relative z-10 opacity-50">
          <AvatarFallback className="bg-[#2f3136] text-[#72767d] text-sm font-medium">
            ?
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col w-full min-w-0">
          <span className="text-sm text-[#72767d] italic">[Message deleted]</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Main Message */}
      <div
        className={`flex gap-4 w-full group hover:bg-[#32353b] pr-4 py-1 rounded-md transition-colors duration-75 ${
          isNested ? 'pl-4' : '-ml-4 pl-4'
        }`}
      >
        {/* Thread Line for nested messages */}
        {isNested && (
          <div className="absolute left-[20px] top-0 bottom-0 w-[2px] bg-[#3f4147] rounded-full" />
        )}

        {/* Avatar */}
        <Avatar className="w-10 h-10 mt-0.5 shrink-0 cursor-pointer transition-transform duration-150 hover:scale-105 hover:shadow-md relative z-10">
          <AvatarImage src={message.sender.image || ""} />
          <AvatarFallback className="bg-[#5865f2] text-white text-sm font-medium">
            {message.sender.name?.substring(0, 2).toUpperCase() || "U"}
          </AvatarFallback>
        </Avatar>

        <div className="flex flex-col w-full min-w-0">
          {/* Sender Name & Time */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-base font-medium text-white hover:underline cursor-pointer">
              {message.sender.name || "Unknown"}
            </span>
            <span className="text-xs text-[#72767d] ml-1">
              {formatTime(message.createdAt)}
            </span>
            {message.isEdited && (
              <span className="text-xs text-[#72767d]">(edited)</span>
            )}
            {message.isPinned && (
              <span className="text-xs text-[#f0b232] font-medium">📌 Pinned</span>
            )}
            {isNested && message.parentId && (
              <span className="text-xs text-[#72767d]">· reply</span>
            )}
          </div>

          {/* Message Content */}
          <div className="text-[#dcddde] text-base leading-5 whitespace-pre-wrap break-words font-normal">
            {message.content && <p>{message.content}</p>}

            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className={`flex flex-wrap gap-2 ${message.content ? "mt-2" : ""}`}>
                {message.attachments.map((file) => (
                  <AttachmentItem key={file.id} file={file} />
                ))}
              </div>
            )}
          </div>

          {/* Reply Button - shows on hover */}
          <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-[#b9bbbe] hover:text-white hover:bg-[#3f4147]"
              onClick={() => onReply?.(message.id)}
            >
              <MessageSquare className="h-3 w-3 mr-1" />
              Reply
            </Button>
            {hasReplies && (
              <span className="text-xs text-[#72767d]">
                {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Replies Section */}
      {hasReplies && (
        <div className="ml-[56px] mt-2 relative">
          {/* Collapse/Expand Button */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-xs text-[#5865f2] hover:text-[#7289da] font-medium mb-2 cursor-pointer transition-colors"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Hide {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                Show {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
              </>
            )}
          </button>

          {/* Nested Replies */}
          {isExpanded && (
            <div className="space-y-2">
              {replies.map((reply) => (
                <ThreadMessage
                  key={reply.id}
                  message={reply}
                  replies={allReplies.get(reply.id) || []}
                  currentUser={currentUser}
                  onReply={onReply}
                  allReplies={allReplies}
                  isNested={true}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Helper function to organize messages into threads
function organizeThreads(messages: Message[]) {
  const topLevelMessages: Message[] = [];
  const repliesMap = new Map<string, Message[]>();

  // First pass: separate top-level and replies
  messages.forEach((message) => {
    if (!message.parentId) {
      topLevelMessages.push(message);
    } else {
      const existing = repliesMap.get(message.parentId) || [];
      repliesMap.set(message.parentId, [...existing, message]);
    }
  });

  // Sort top-level messages by creation time
  topLevelMessages.sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  // Sort replies by creation time
  repliesMap.forEach((replies) => {
    replies.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  });

  return { topLevelMessages, repliesMap };
}

// Helper to count all nested replies
function countAllReplies(messageId: string, repliesMap: Map<string, Message[]>): number {
  const directReplies = repliesMap.get(messageId) || [];
  let count = directReplies.length;

  directReplies.forEach((reply) => {
    count += countAllReplies(reply.id, repliesMap);
  });

  return count;
}

function AttachmentItem({ file }: { file: Attachment }) {
  const isImage = file.type === "IMAGE" || (file.type && file.type.startsWith("image/"));

  if (isImage) {
    return (
      <div className="relative group overflow-hidden rounded-lg mt-1 max-w-full">
        <Image 
          src={file.url} 
          alt={file.name || "attachment"} 
          width={400}
          height={300}
          className="max-w-full md:max-w-sm lg:max-w-md max-h-[300px] object-cover rounded-lg cursor-pointer"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-md max-w-full bg-[#2f3136] border border-[#202225]">
      <div className="p-2 bg-[#161618] rounded-md">
        <FileIcon className="w-6 h-6 text-[#8e9297]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#dcddde] truncate max-w-[200px] hover:underline cursor-pointer">
          {file.name || "File"}
        </p>
        <p className="text-xs text-[#72767d] uppercase">
          {file.type.split('/').pop()} {file.size ? `· ${formatBytes(file.size)}` : ''}
        </p>
      </div>
      <a 
        href={file.url} 
        target="_blank" 
        rel="noopener noreferrer" 
        className="p-1.5 text-[#b9bbbe] hover:text-[#dcddde] rounded-full transition-colors"
      >
        <Download className="w-5 h-5" />
      </a>
    </div>
  );
}

function formatTime(date: Date | string) {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) {
    return `Today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } else if (d.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } else {
    return d.toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' }) + 
      ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
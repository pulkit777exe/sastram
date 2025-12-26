"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FileIcon, Download } from "lucide-react";
import type { Message, Attachment } from "@/lib/types/index";
import Image from "next/image";

interface MessageListProps {
  messages: Message[];
  currentUser: {
    id: string;
  };
}

export function MessageList({ messages, currentUser }: MessageListProps) {
  return (
    <div className="flex flex-col py-2 px-2 space-y-4">
      {messages.map((message, index) => {
        const isMe = message.senderId === currentUser.id;
        const showAvatar = index === 0 || messages[index - 1].senderId !== message.senderId;

        return (
          <div
            key={message.id}
            className={`flex gap-4 w-full group pl-0 hover:bg-[#32353b] -ml-4 pr-4 py-1 rounded-md transition-colors duration-75`}
            style={{ marginTop: showAvatar ? '1.0625rem' : '0.125rem' }}
          >
            {/* Avatar */}
            {showAvatar ? (
              <Avatar className="w-10 h-10 mt-0.5 shrink-0 cursor-pointer transition-transform duration-150 hover:scale-105 hover:shadow-md">
                <AvatarImage src={message.sender.image || ""} />
                <AvatarFallback className="bg-[#5865f2] text-white text-sm font-medium">
                  {message.sender.name?.substring(0, 2).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
            ) : (
              <div className="w-10 h-10 shrink-0" /> 
            )}

            <div className="flex flex-col w-full min-w-0">
              {/* Sender Name & Time */}
              {showAvatar && (
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-medium text-white hover:underline cursor-pointer">
                    {message.sender.name || "Unknown"}
                  </span>
                  <span className="text-xs text-[#72767d] ml-1">
                    {formatTime(message.createdAt)}
                  </span>
                </div>
              )}

              {/* Message Content */}
              <div className="text-[#dcddde] text-base leading-5 whitespace-pre-wrap wrap-break-word font-normal">
                {/* Text Content */}
                {message.content && (
                  <p>{message.content}</p>
                )}

                {/* Attachments Area */}
                {message.attachments && message.attachments.length > 0 && (
                  <div className={`flex flex-wrap gap-2 ${message.content ? "mt-2" : ""}`}>
                    {message.attachments.map((file) => (
                      <AttachmentItem key={file.id} file={file} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AttachmentItem({ file }: { file: Attachment }) {
  const isImage = file.type === "IMAGE" || (file.type && file.type.startsWith("image/"));

  if (isImage) {
    return (
      <div className="relative group overflow-hidden rounded-lg mt-1 max-w-full">
        <Image 
          src={file.url} 
          alt={file.name || "attachment"} 
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
        <p className="text-sm font-medium text-[#dcddde] truncate max-w-[200px] hover:underline cursor-pointer">{file.name || "File"}</p>
        <p className="text-xs text-[#72767d] uppercase">{file.type.split('/').pop()} {file.size ? `· ${formatBytes(file.size)}` : ''}</p>
      </div>
      <a href={file.url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-[#b9bbbe] hover:text-[#dcddde] rounded-full transition-colors">
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
    return d.toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
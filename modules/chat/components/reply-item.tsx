import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MessageSquare, CornerDownRight } from "lucide-react";
import type { Message, Attachment } from "@/lib/types/index";
import { formatTime } from "./message-list";

interface ReplyItemProps {
  message: Message;
  replyToMessage?: Message;
  currentUser: { id: string };
  onReply?: (id: string) => void;
  isSequence: boolean;
  isActiveReplyTarget?: boolean;
}

export function ReplyItem({ 
  message, 
  replyToMessage, 
  currentUser, 
  onReply, 
  isSequence,
  isActiveReplyTarget = false
}: ReplyItemProps) {

  if (message.deletedAt) {
    return <div className="text-sm text-[#72767d] italic py-1 pl-[72px]">Message deleted</div>;
  }

  return (
    <div 
      className={`
        group relative flex flex-col pr-4 py-0.5 transition-colors duration-200
        ${isSequence ? 'mt-0' : 'mt-[17px]'}
        
        ${isActiveReplyTarget 
          ? 'bg-[#faa61a]/10 pl-[70px] border-l-2 border-[#faa61a]'
          : 'hover:bg-[#32353b]/40 pl-[72px] border-l-2 border-transparent' 
        }
      `}
    >
      {replyToMessage && !isSequence && (
        <div className="flex items-center gap-2 mb-1 -ml-[50px] opacity-100 select-none">
          <div className="w-8 flex justify-end">
             <CornerDownRight className="w-3 h-3 text-[#b9bbbe] mb-0.5 border-t-2 border-l-2 border-[#b9bbbe]/0 rounded-tl-md" />
          </div>
          <div className="flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity">
            <Avatar className="w-4 h-4">
              <AvatarImage src={replyToMessage.sender.image || ""} />
              <AvatarFallback className="text-[9px] bg-[#5865f2]">
                {replyToMessage.sender.name?.[0] || "?"}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs font-medium text-[#b9bbbe] hover:text-white cursor-pointer">
              @{replyToMessage.sender.name}
            </span>
            <span className="text-xs text-[#b9bbbe] truncate max-w-[300px]">
              {replyToMessage.content}
            </span>
          </div>
        </div>
      )}

      <div className="relative">
        
        {(!isSequence || replyToMessage) && (
          <div className="absolute -left-14 top-0.5">
            <Avatar className="w-10 h-10 cursor-pointer hover:drop-shadow-md transition-all active:translate-y-px">
              <AvatarImage src={message.sender.image || ""} />
              <AvatarFallback className="bg-[#5865f2] text-white">
                 {message.sender.name?.[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        )}

        {(!isSequence || replyToMessage) && (
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-base font-medium text-white hover:underline cursor-pointer">
              {message.sender.name}
            </span>
            <span className="text-xs text-[#72767d]">
              {formatTime(message.createdAt)}
            </span>
          </div>
        )}

        <div className={`text-[#dcddde] text-base/6 font-normal whitespace-pre-wrap`}>
          {message.content}
        </div>

        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {/* Map attachments here */}
          </div>
        )}
      </div>

      <div className="absolute right-4 -top-2 bg-[#36393f] shadow-sm border border-[#2f3136] rounded-md flex items-center p-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 hover:bg-[#40444b] text-[#b9bbbe] hover:text-[#dcddde]" 
          onClick={() => onReply?.(message.id)}
        >
          <MessageSquare className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Gift, Smile, Sticker, Send, Loader2, FileIcon, X, MessageSquare } from "lucide-react";
import { postMessage } from "@/modules/messages/actions";
import { toast } from "sonner";
import { validateFile } from "@/lib/services/content-safety";
import type { Message } from "@/lib/types/index";

interface PostMessageFormProps {
  sectionId: string;
  onMessagePosted?: (message: Message) => void;
  replyTo?: {
    messageId: string;
    userName: string;
  } | null;
  onCancelReply?: () => void;
}

export function PostMessageForm({ 
  sectionId, 
  onMessagePosted,
  replyTo,
  onCancelReply
}: PostMessageFormProps) {
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    formData.append("sectionId", sectionId);
  
    if (selectedFile) {
      formData.append("fileName", selectedFile.name);
      formData.append("fileType", selectedFile.type);
      formData.append("fileSize", selectedFile.size.toString());
    }

    if (replyTo) {
      formData.append("parentId", replyTo.messageId);
    }
  
    const result = await postMessage(formData);
    setLoading(false);
  
    if (result && "error" in result && result.error) {
      toast.error(result.error);
    } else if (result && "success" in result && result.success) {
      formRef.current?.reset();
      setSelectedFile(null);
      onCancelReply?.();
      
      if (result.data && onMessagePosted) {
        const transformedMessage = {
          ...result.data,
          attachments: result.data.attachments.map(att => ({
            ...att,
            size: att.size !== null ? Number(att.size) : null,
          })),
        };
        onMessagePosted(transformedMessage);
      }
    }
  }  

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateFile(file);
    if (!validation.isValid) {
      toast.error(validation.error);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedFile(file);
  };

  const placeholder = replyTo 
    ? `Reply to ${replyTo.userName}...`
    : "Message #chat";

  return (
    <form ref={formRef} action={handleSubmit} className="relative px-4 pb-0 pt-0">
      {replyTo && (
        <div className="absolute -top-12 left-4 right-4 bg-[#2f3136] border border-[#202225] p-2 rounded-t-md text-sm flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#b9bbbe]">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Replying to</span>
            <span className="text-[#5865f2] font-medium">{replyTo.userName}</span>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="text-[#72767d] hover:text-[#dcddde] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {selectedFile && (
        <div className={`absolute ${replyTo ? '-top-24' : '-top-14'} left-4 bg-[#2f3136] border border-[#202225] p-2 rounded-md text-sm flex items-center gap-2 shadow-md`}>
          <FileIcon className="h-4 w-4 text-[#b9bbbe]" />
          <span className="truncate max-w-[200px] text-[#dcddde]">{selectedFile.name}</span>
          <button
            type="button"
            onClick={() => {
              setSelectedFile(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="ml-2 cursor-pointer text-[#72767d] hover:text-[#dcddde]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className={`flex items-center rounded-lg p-0 pr-2 focus-within:ring-1 focus-within:ring-[#5865f2] transition-all ${
        replyTo ? 'border-t border-[#202225] rounded-t-none' : ''
      }`}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="hover:bg-transparent h-11 w-11 ml-1 shrink-0"
          onClick={() => fileInputRef.current?.click()}
        >
          <PlusCircle className="h-6 w-6" />
        </Button>
        
        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
        
        <Textarea
          ref={textareaRef}
          name="content"
          placeholder={placeholder}
          className="flex-1 min-h-11 max-h-[50vh] bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 resize-none py-3 px-2 text-base"
          onKeyDown={(e) => {
             if (e.key === 'Enter' && !e.shiftKey) {
               e.preventDefault();
               formRef.current?.requestSubmit();
             }
             if (e.key === 'Escape' && replyTo) {
               onCancelReply?.();
             }
          }}
        />

        <div className="flex items-center gap-1 shrink-0">
          <Button type="button" variant="ghost" size="icon" className="hover:bg-transparent h-10 w-10">
            <Gift className="h-6 w-6" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="hover:bg-transparent h-10 w-10">
            <Sticker className="h-6 w-6" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="hover:bg-transparent h-10 w-10">
            <Smile className="h-6 w-6" />
          </Button>
        </div>
      </div>
      <div className="hidden">
        <Button 
          type="submit" 
          disabled={loading} 
          className="rounded-md px-4 h-10 shadow-sm"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </Button>
      </div>
    </form>
  );
}
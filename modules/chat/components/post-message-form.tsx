"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Gift, Smile, Sticker, Send, Loader2, FileIcon, X } from "lucide-react";
import { postMessage } from "@/app/actions/message";
import { toast } from "sonner";
import { validateFile } from "@/lib/content-safety";
import type { Message } from "@/lib/types";

interface PostMessageFormProps {
  sectionId: string;
  onMessagePosted?: (message: Message) => void;
}

export function PostMessageForm({ sectionId, onMessagePosted }: PostMessageFormProps) {
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    formData.append("sectionId", sectionId);
    
    if (selectedFile) {
      formData.append("fileName", selectedFile.name);
      formData.append("fileType", selectedFile.type);
      formData.append("fileSize", selectedFile.size.toString());
    }

    const result = await postMessage(formData);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      // toast.success("Message posted!");
      formRef.current?.reset();
      setSelectedFile(null);
      if (result.data && onMessagePosted) {
        onMessagePosted(result.data);
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

  return (
    <form ref={formRef} action={handleSubmit} className="relative px-4 pb-0 pt-0 bg-[#161618]">
      {/* File Preview Popup */}
      {selectedFile && (
        <div className="absolute -top-14 left-4 bg-[#2f3136] border border-[#202225] p-2 rounded-md text-sm flex items-center gap-2 text-[#dcddde] shadow-md">
          <FileIcon className="h-4 w-4 text-[#8e9297]" />
          <span className="truncate max-w-[200px]">{selectedFile.name}</span>
          <button
            type="button"
            onClick={() => {
              setSelectedFile(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="ml-2 text-[#b9bbbe] hover:text-[#dcddde] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center bg-[#40444b] rounded-lg p-0 pr-2 focus-within:ring-1 focus-within:ring-[#5865f2] transition-all">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-[#b9bbbe] hover:text-[#dcddde] hover:bg-transparent h-11 w-11 ml-1 shrink-0"
          onClick={() => fileInputRef.current?.click()}
        >
          <PlusCircle className="h-6 w-6" />
        </Button>
        
        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
        
        <Textarea
          name="content"
          placeholder="Message #chat"
          className="flex-1 min-h-[44px] max-h-[50vh] bg-transparent border-none text-[#dcddde] placeholder-[#72767d] focus-visible:ring-0 focus-visible:ring-offset-0 resize-none py-3 px-2 text-base"
          onKeyDown={(e) => {
             if (e.key === 'Enter' && !e.shiftKey) {
               e.preventDefault();
               formRef.current?.requestSubmit();
             }
          }}
        />

        <div className="flex items-center gap-1 shrink-0 text-[#b9bbbe]">
          <Button type="button" variant="ghost" size="icon" className="hover:text-[#dcddde] hover:bg-transparent h-10 w-10">
            <Gift className="h-6 w-6" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="hover:text-[#dcddde] hover:bg-transparent h-10 w-10">
            <Sticker className="h-6 w-6" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="hover:text-[#dcddde] hover:bg-transparent h-10 w-10">
            <Smile className="h-6 w-6" />
          </Button>
        </div>
      </div>
      <div className="hidden">
        <Button 
          type="submit" 
          disabled={loading} 
          className="bg-[#5865f2] hover:bg-[#4752c4] text-white rounded-md px-4 h-10 shadow-sm"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </Button>
      </div>
    </form>
  );
}
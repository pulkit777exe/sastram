"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Paperclip, X } from "lucide-react";
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
      // In a real app, you would upload the file here (e.g., Vercel Blob)
      // and send the URL to the server.
      // For this MVP/Mock, we'll send the file name and type to simulate.
      formData.append("fileName", selectedFile.name);
      formData.append("fileType", selectedFile.type);
      formData.append("fileSize", selectedFile.size.toString());
    }

    const result = await postMessage(formData);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Message posted!");
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
    <form ref={formRef} action={handleSubmit} className="flex flex-col gap-2 p-4 border-t bg-background/95 backdrop-blur sticky bottom-0">
      {selectedFile && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-2 rounded-md w-fit">
          <Paperclip className="h-4 w-4" />
          {selectedFile.name}
          <button
            type="button"
            onClick={() => {
              setSelectedFile(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="ml-2 hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="flex gap-2 items-end">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-[60px] w-[60px]"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-5 w-5" />
        </Button>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileSelect}
        />
        <Textarea
          name="content"
          placeholder="Type your message..."
          className="min-h-[60px] resize-none"
          required
        />
        <Button type="submit" size="icon" disabled={loading} className="h-[60px] w-[60px]">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </Button>
      </div>
    </form>
  );
}

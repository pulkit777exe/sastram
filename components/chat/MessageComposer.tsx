"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowUp, ImageIcon, Paperclip, X, FileText } from "lucide-react";
import { logger } from "@/lib/logger";
import type { AttachmentInput } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MessageComposerProps {
  onSend: (message: string, files: AttachmentInput[]) => void;
  disabled?: boolean;
  sectionName: string;
}

export function MessageComposer({ onSend, disabled, sectionName }: MessageComposerProps) {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleSend = async () => {
    if ((message.trim() || files.length > 0) && !disabled) {
      let attachments = [];
      if (files.length > 0) {
        const formData = new FormData();
        files.forEach((file) => formData.append("files", file));
        try {
          const response = await fetch("/api/upload", { method: "POST", body: formData });
          if (!response.ok) throw new Error("Upload failed");
          const data = await response.json();
          attachments = data.files;
        } catch (error) {
          logger.error("Error uploading files:", error);
          return;
        }
      }
      onSend(message, attachments);
      setMessage("");
      setFiles([]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="p-4 max-w-5xl mx-auto w-full">
      {/* Container - Using the 2xl/3xl rounded look from Lunor */}
      <div className="relative bg-white border border-zinc-200 rounded-3xl shadow-sm transition-all focus-within:border-zinc-300 focus-within:shadow-md overflow-hidden">
        
        {/* Attachment Preview Area */}
        <AnimatePresence>
          {files.length > 0 && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex flex-wrap gap-2 p-3 border-b border-zinc-100 bg-zinc-50/50"
            >
              {files.map((file, index) => (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  key={index}
                  className="flex items-center gap-2 bg-white border border-zinc-200 rounded-xl pl-2 pr-1 py-1 shadow-sm"
                >
                  <FileText size={14} className="text-zinc-400" />
                  <span className="text-[11px] font-bold text-zinc-700 truncate max-w-[120px]">
                    {file.name}
                  </span>
                  <button
                    onClick={() => removeFile(index)}
                    className="p-1 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-400 hover:text-zinc-600"
                  >
                    <X size={14} />
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Area */}
        <div className="flex flex-col p-2">
          <textarea
            rows={1}
            placeholder={`Message #${sectionName}`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={disabled}
            className="w-full bg-transparent border-none focus:ring-0 text-zinc-900 placeholder:text-zinc-400 text-sm py-3 px-4 resize-none min-h-12"
          />

          {/* Action Row */}
          <div className="flex items-center justify-between px-2 pb-1">
            <div className="flex items-center gap-1">
              <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />

              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                onClick={() => imageInputRef.current?.click()}
                disabled={disabled}
              >
                <ImageIcon size={18} />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
              >
                <Paperclip size={18} />
              </Button>
            </div>

            {/* Send Button - High Contrast Black */}
            <Button
              onClick={handleSend}
              disabled={(!message.trim() && files.length === 0) || disabled}
              className={cn(
                "h-9 w-9 rounded-full transition-all duration-200",
                message.trim() || files.length > 0 
                  ? "bg-zinc-900 text-white shadow-lg shadow-zinc-200 scale-100" 
                  : "bg-zinc-100 text-zinc-400 scale-95"
              )}
            >
              <ArrowUp size={18} strokeWidth={2.5} />
            </Button>
          </div>
        </div>
      </div>
      <p className="text-[10px] text-zinc-400 text-center mt-3 font-medium tracking-tight">
        Press <span className="bg-zinc-100 px-1 rounded border border-zinc-200">Enter</span> to send, <span className="bg-zinc-100 px-1 rounded border border-zinc-200">Shift + Enter</span> for new line
      </p>
    </div>
  );
}
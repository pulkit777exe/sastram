"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Paperclip, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";

interface MessageComposerProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function MessageComposer({ onSend, disabled }: MessageComposerProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSend(message);
      setMessage("");
      textareaRef.current?.focus();
    }
  };

  return (
    <div className="border-t border-border bg-dark-secondary p-4">
      <div className="max-w-5xl mx-auto">
        <Card className="bg-dark-primary border-border shadow-lg">
          <div className="p-3">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message... (Press Enter to send, Shift+Enter for newline)"
              className="min-h-[60px] resize-none border-0 focus-visible:ring-0 bg-transparent text-foreground placeholder:text-muted-foreground"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={disabled}
              aria-label="Message input"
            />
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 hover:bg-accent shadow-inner focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Attach file"
                >
                  <Paperclip className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 hover:bg-accent shadow-inner focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Add emoji"
                >
                  <Smile className="h-5 w-5" />
                </Button>
              </div>
              <Button
                className="bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-inner focus-visible:ring-2 focus-visible:ring-primary"
                size="sm"
                onClick={handleSend}
                disabled={!message.trim() || disabled}
              >
                <Send className="h-4 w-4 mr-2" />
                Send
              </Button>
            </div>
          </div>
        </Card>
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-2 flex-wrap">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-accent rounded text-foreground">Tab</kbd> to navigate
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-accent rounded text-foreground">Enter</kbd> to send
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-accent rounded text-foreground">Shift+Enter</kbd> for newline
          </span>
        </div>
      </div>
    </div>
  );
}
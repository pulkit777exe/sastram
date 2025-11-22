import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import type { Message } from "@/lib/types";

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <Card key={message.id} className="border-none shadow-sm bg-card/50">
          <CardContent className="p-4 flex gap-4">
            <Avatar>
              <AvatarImage src={message.sender.image || ""} />
              <AvatarFallback>{message.sender.name?.[0] || "U"}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm">{message.sender.name || "Unknown User"}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(message.createdAt, { addSuffix: true })}
                </span>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
              {message.attachments && message.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {message.attachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center gap-2 p-2 rounded-md bg-muted text-sm">
                      <span className="font-medium">{attachment.name}</span>
                      <span className="text-xs text-muted-foreground">(Mock)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

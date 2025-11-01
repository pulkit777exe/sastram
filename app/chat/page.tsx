"use client";

import { useState } from "react";
import { useSession } from "@/lib/auth-client";
import { useConversations } from "@/hooks/useConversations";
import { useMessages, useSendMessage } from "@/hooks/useMessages";
import { ConversationItem } from "@/components/chat/ConversationItem";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { redirect } from "next/navigation";

export default function ChatPage() {
  const { data: session, isPending } = useSession();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  
  const { data: conversations, isLoading: conversationsLoading } = useConversations();
  const { data: messages, isLoading: messagesLoading } = useMessages(selectedConversationId || "");
  const sendMessage = useSendMessage(selectedConversationId || "");

  if (isPending) return <div>Loading...</div>;
  if (!session) redirect("/login");

  const handleSendMessage = (content: string) => {
    sendMessage.mutate(content);
  };

  return (
    <div className="flex h-screen bg-dark-primary">
      {/* Sidebar with conversations */}
      <div className="w-72 bg-dark-secondary border-r border-border">
        <div className="p-4">
          <h2 className="text-lg font-semibold text-primary mb-3">We Write Code</h2>
        </div>
        <div className="space-y-1 p-2">
          {conversationsLoading ? (
            <div>Loading conversations...</div>
          ) : (
            conversations?.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isSelected={selectedConversationId === conv.id}
                onClick={() => setSelectedConversationId(conv.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {selectedConversationId ? (
          <>
            <div className="flex-1 overflow-y-auto p-4">
              {messagesLoading ? (
                <div>Loading messages...</div>
              ) : (
                messages?.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))
              )}
            </div>
            <MessageComposer onSend={handleSendMessage} disabled={sendMessage.isPending} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Select a conversation to start chatting
          </div>
        )}
      </div>
    </div>
  );
}
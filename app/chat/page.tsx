"use client";

import { useState } from "react";
import { useSession } from "@/lib/auth-client";
import { useConversations } from "@/hooks/useConversations";
import { useMessages, useSendMessage } from "@/hooks/useMessages";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatMain } from "@/components/chat/ChatMain";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { CreateSectionDialog } from "@/components/chat/CreateSectionDialog";
import { redirect } from "next/navigation";

export default function ChatPage() {
  const { data: session, isPending } = useSession();
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const { data: conversations, isLoading: conversationsLoading } = useConversations();
  const { data: messages, isLoading: messagesLoading } = useMessages(selectedSectionId || "");
  const sendMessage = useSendMessage(selectedSectionId || "");

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!session) {
    redirect("/login");
  }

  const user = session.user as typeof session.user & { role: string };
  const isAdmin = user.role === "ADMIN";
  const selectedSection = conversations?.find((c) => c.id === selectedSectionId);

  const handleSendMessage = async (content: string, attachments: any[]) => {
    sendMessage.mutate({ content, attachments });
  };

  return (
    <div className="flex h-screen bg-background">
      <ChatSidebar
        conversations={conversations || []}
        activeSectionId={selectedSectionId}
        onSectionSelect={setSelectedSectionId}
        onCreateSection={() => setIsCreateDialogOpen(true)}
        isAdmin={isAdmin}
      />

      <div className="flex flex-1 flex-col">
        {selectedSectionId && selectedSection ? (
          <>
            <ChatMain
              sectionName={selectedSection.name}
              sectionDescription={selectedSection.lastMessage}
              messages={messages || []}
              isLoading={messagesLoading}
            />
            <MessageComposer
              onSend={handleSendMessage}
              disabled={sendMessage.isPending}
              sectionName={selectedSection.name}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-muted-foreground">
                Welcome to the Forum
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Select a section from the sidebar to start chatting
              </p>
            </div>
          </div>
        )}
      </div>

      <CreateSectionDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </div>
  );
}
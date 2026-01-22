"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";
import { ThreadAccessModal } from "./access-management-modal";

interface ThreadManagementControlsProps {
  threadId: string;
  creatorId: string;
  currentUserId: string;
  threadName: string;
}

export function ThreadManagementControls({
  threadId,
  creatorId,
  currentUserId,
}: ThreadManagementControlsProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (currentUserId !== creatorId) {
    return null;
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="hidden sm:flex items-center gap-1.5 h-8 text-xs font-medium"
        onClick={() => setIsModalOpen(true)}
      >
        <Users size={13} />
        Manage Access
      </Button>

      <ThreadAccessModal
        threadId={threadId}
        creatorId={creatorId}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}

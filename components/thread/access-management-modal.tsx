"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Trash2, Shield, Crown } from "lucide-react";
import { toast } from "sonner";
import {
  getThreadMembersAction,
  manageThreadMemberAction,
} from "@/modules/threads/actions";
import type { ThreadMember } from "@/modules/threads/types";
import { SectionRole } from "@prisma/client";

interface ThreadAccessModalProps {
  threadId: string;
  creatorId: string;
  isOpen: boolean;
  onClose: () => void;
}

type ConfirmActionState = {
  type: "update_role" | "remove";
  userId: string;
  userName: string;
  role?: SectionRole;
} | null;

export function ThreadAccessModal({
  threadId,
  creatorId,
  isOpen,
  onClose,
}: ThreadAccessModalProps) {
  const [members, setMembers] = useState<ThreadMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      getThreadMembersAction(threadId)
        .then(setMembers)
        .catch(() => toast.error("Failed to load members"))
        .finally(() => setLoading(false));
    }
  }, [isOpen, threadId]);

  const handleRoleChangeRequest = (
    userId: string,
    userName: string,
    newRole: SectionRole,
  ) => {
    setConfirmAction({
      type: "update_role",
      userId,
      userName,
      role: newRole,
    });
  };

  const handleRemoveRequest = (userId: string, userName: string) => {
    setConfirmAction({
      type: "remove",
      userId,
      userName,
    });
  };

  const executeAction = async () => {
    if (!confirmAction) return;

    try {
      if (confirmAction.type === "update_role") {
        if (!confirmAction.role) return;
        await manageThreadMemberAction({
          threadId,
          userId: confirmAction.userId,
          action: "update_role",
          role: confirmAction.role,
        });
        toast.success(`Role updated for ${confirmAction.userName}`);
        setMembers((prev) =>
          prev.map((m) =>
            m.userId === confirmAction.userId
              ? { ...m, role: confirmAction.role! }
              : m,
          ),
        );
      } else if (confirmAction.type === "remove") {
        await manageThreadMemberAction({
          threadId,
          userId: confirmAction.userId,
          action: "remove",
        });
        toast.success(`${confirmAction.userName} removed from thread`);
        setMembers((prev) =>
          prev.filter((m) => m.userId !== confirmAction.userId),
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to execute action",
      );
    } finally {
      setConfirmAction(null);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Access</DialogTitle>
            <DialogDescription>
              Control who has access to this thread.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {loading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="animate-spin text-muted-foreground" />
              </div>
            ) : members.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No members found.
              </div>
            ) : (
              <ScrollArea className="h-[350px] pr-4 -mr-4">
                <div className="space-y-4 pr-4">
                  {members.map((member) => {
                    const isCreator = member.userId === creatorId;
                    const userName = member.user.name || "Anonymous";

                    return (
                      <div
                        key={member.id}
                        className="flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 border">
                            <AvatarImage
                              src={member.user.avatarUrl || undefined}
                            />
                            <AvatarFallback>
                              {member.user.name?.[0]?.toUpperCase() || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium leading-none">
                                {userName}
                              </p>
                              {isCreator && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] h-4 px-1 flex gap-1"
                                >
                                  <Crown size={8} /> CREATOR
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Joined{" "}
                              {new Date(member.joinedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!isCreator ? (
                            <>
                              <Select
                                value={member.role}
                                onValueChange={(val) =>
                                  handleRoleChangeRequest(
                                    member.userId,
                                    userName,
                                    val as SectionRole,
                                  )
                                }
                              >
                                <SelectTrigger className="w-[110px] h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="MEMBER">Member</SelectItem>
                                  <SelectItem value="MODERATOR">
                                    Moderator
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() =>
                                  handleRemoveRequest(member.userId, userName)
                                }
                              >
                                <Trash2 size={14} />
                              </Button>
                            </>
                          ) : (
                            <div className="pr-2">
                              <Shield
                                size={14}
                                className="text-muted-foreground/50"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmAction}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "remove"
                ? `You are about to remove ${confirmAction.userName} from this thread. They will lose access immediately.`
                : `You are about to change ${confirmAction?.userName}'s role to ${confirmAction?.role}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeAction}
              className={
                confirmAction?.type === "remove"
                  ? "bg-destructive hover:bg-destructive/90"
                  : ""
              }
            >
              {confirmAction?.type === "remove"
                ? "Remove Member"
                : "Update Role"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

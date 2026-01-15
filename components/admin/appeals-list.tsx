"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resolveAppeal } from "@/modules/appeals/actions";
import { toast } from "sonner";
import { Check, X } from "lucide-react";

interface Appeal {
  id: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  reason: string;
  status: string;
  createdAt: Date;
  banReason: string;
  banDate: Date;
}

export function AppealsList({ appeals }: { appeals: Appeal[] }) {
  const [selectedAppeal, setSelectedAppeal] = useState<Appeal | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionType, setActionType] = useState<"APPROVE" | "REJECT" | null>(
    null
  );

  const handleResolve = async () => {
    if (!selectedAppeal || !actionType) return;

    setIsProcessing(true);
    const approved = actionType === "APPROVE";

    // In a real app, we might want to send a rejection reason note.
    // For now assuming resolveAppeal handles basic logic.

    const result = await resolveAppeal(selectedAppeal.id, approved);

    if (result && "message" in result && result.message) {
      toast.error(result.message);
    } else {
      toast.success(
        `Appeal ${approved ? "approved" : "rejected"} successfully`
      );
      setSelectedAppeal(null);
      setActionType(null);
    }
    setIsProcessing(false);
  };

  if (appeals.length === 0) {
    return (
      <div className="text-center py-12 border border-border dashed rounded-xl">
        <p className="text-muted-foreground">No pending appeals</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>User</TableHead>
              <TableHead>Ban Date</TableHead>
              <TableHead>Ban Reason</TableHead>
              <TableHead>Appeal Reason</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appeals.map((appeal) => (
              <TableRow key={appeal.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={appeal.user.image || undefined} />
                      <AvatarFallback>
                        {appeal.user.name?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">{appeal.user.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {appeal.user.email}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(appeal.banDate), "MMM d, yyyy")}
                </TableCell>
                <TableCell
                  className="max-w-[200px] truncate text-sm"
                  title={appeal.banReason}
                >
                  {appeal.banReason}
                </TableCell>
                <TableCell
                  className="max-w-[300px] truncate text-sm italic text-muted-foreground"
                  title={appeal.reason}
                >
                  &quot;{appeal.reason}&quot;
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSelectedAppeal(appeal);
                        setActionType("REJECT");
                      }}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSelectedAppeal(appeal);
                        setActionType("APPROVE");
                      }}
                      className="text-green-500 hover:text-green-700 hover:bg-green-50"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={!!selectedAppeal}
        onOpenChange={(open) => !open && setSelectedAppeal(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "APPROVE"
                ? "Approve Appeal & Unban User"
                : "Reject Appeal"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "APPROVE"
                ? "This will immediately unban the user and restore their access."
                : "The user will remain banned. They cannot submit another appeal for this ban."}
            </DialogDescription>
          </DialogHeader>

          {selectedAppeal && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-[100px_1fr] gap-2 text-sm">
                <span className="text-muted-foreground">User:</span>
                <span className="font-medium">{selectedAppeal.user.name}</span>

                <span className="text-muted-foreground">Ban Reason:</span>
                <span>{selectedAppeal.banReason}</span>

                <span className="text-muted-foreground">Appeal:</span>
                <div className="p-3 bg-muted rounded-md text-xs italic">
                  &quot;{selectedAppeal.reason}&quot;
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedAppeal(null)}>
              Cancel
            </Button>
            <Button
              variant={actionType === "APPROVE" ? "default" : "destructive"}
              onClick={handleResolve}
              disabled={isProcessing}
            >
              {isProcessing
                ? "Processing..."
                : actionType === "APPROVE"
                ? "Approve Appeal"
                : "Reject Appeal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

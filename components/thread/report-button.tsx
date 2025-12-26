"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Flag } from "lucide-react";
import { createReport } from "@/modules/reports/actions";
import { toast } from "sonner";

interface ReportButtonProps {
  messageId: string;
}

export function ReportButton({ messageId }: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 10) {
      toast.error("Please provide a reason (at least 10 characters)");
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("messageId", messageId);
    formData.append("reason", reason);

    const result = await createReport(formData);
    setIsSubmitting(false);

    if (result && "error" in result && result.error) {
      toast.error(result.error);
    } else if (result && "success" in result && result.success) {
      toast.success("Report submitted successfully. Thank you for helping keep our community safe.");
      setReason("");
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-zinc-400 hover:text-red-400"
        >
          <Flag className="w-3 h-3 mr-1" />
          Report
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-[#161618] border-zinc-800 text-white sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight">
            Report Message
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Help us keep the community safe by reporting inappropriate content.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reason" className="text-zinc-300">
              Reason for reporting
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Please describe why you're reporting this message..."
              className="min-h-[120px] bg-[#1C1C1E] border-zinc-700 text-white placeholder:text-zinc-500 resize-none"
              required
              minLength={10}
              maxLength={500}
            />
            <p className="text-xs text-zinc-500">
              {reason.length}/500 characters (minimum 10)
            </p>
          </div>
          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setReason("");
              }}
              className="text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || reason.trim().length < 10}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              {isSubmitting ? "Submitting..." : "Submit Report"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


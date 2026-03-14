"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { updateReportStatusAction } from "@/modules/reports/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ReportActions({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<
    "RESOLVED" | "DISMISSED" | null
  >(null);
  const [loading, setLoading] = useState(false);

  const confirmAction = (status: "RESOLVED" | "DISMISSED") => {
    setAction(status);
    setOpen(true);
  };

  async function handleStatusUpdate(
    status: "RESOLVED" | "DISMISSED"
  ) {
    setLoading(true);
    const result = await updateReportStatusAction(reportId, status);

    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success(`Report ${status.toLowerCase()}`);
      router.refresh();
    }
    setLoading(false);
    setOpen(false);
    setAction(null);
  }

  const getDialogDetails = () => {
    switch (action) {
      case "RESOLVED":
        return {
          title: "Resolve Report",
          description:
            "Are you sure you want to mark this report as resolved? This indicates that necessary action has been taken.",
          buttonText: "Resolve",
          buttonVariant: "default" as const,
          confirmColor: "bg-green-600 hover:bg-green-500",
        };
      case "DISMISSED":
        return {
          title: "Dismiss Report",
          description:
            "Are you sure you want to dismiss this report? This implies no violation was found.",
          buttonText: "Dismiss",
          buttonVariant: "destructive" as const,
          confirmColor: "bg-zinc-600 hover:bg-zinc-500",
        };
      default:
        return {
          title: "Confirm Action",
          description: "Are you sure?",
          buttonText: "Confirm",
          buttonVariant: "default" as const,
          confirmColor: "",
        };
    }
  };

  const details = getDialogDetails();

  return (
    <>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => confirmAction("RESOLVED")}
          className="bg-green-600 hover:bg-green-500 text-white dark:bg-green-700 dark:hover:bg-green-600"
        >
          <CheckCircle className="w-4 h-4 mr-1" />
          Resolve
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => confirmAction("DISMISSED")}
          className="border-border text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <XCircle className="w-4 h-4 mr-1" />
          Dismiss
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{details.title}</DialogTitle>
            <DialogDescription>{details.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant={details.buttonVariant}
              onClick={() => action && handleStatusUpdate(action)}
              disabled={loading}
              className={
                action === "RESOLVED"
                  ? "bg-green-600 hover:bg-green-500 text-white"
                  : ""
              }
            >
              {loading ? "Processing..." : details.buttonText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

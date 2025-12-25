"use client";

import { Button } from "@/components/ui/button";
import { Eye, CheckCircle, XCircle } from "lucide-react";
import { updateReportStatusAction } from "@/app/actions/report";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function ReportActions({ reportId }: { reportId: string }) {
  const router = useRouter();

  async function handleStatusUpdate(status: "REVIEWING" | "RESOLVED" | "DISMISSED") {
    const result = await updateReportStatusAction(reportId, status);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Report ${status.toLowerCase()}`);
      router.refresh();
    }
  }

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => handleStatusUpdate("REVIEWING")}
        className="border-blue-500/20 text-blue-400 hover:bg-blue-500/10"
      >
        <Eye className="w-4 h-4 mr-1" />
        Mark as Reviewing
      </Button>
      <Button
        size="sm"
        onClick={() => handleStatusUpdate("RESOLVED")}
        className="bg-green-600 hover:bg-green-500 text-white"
      >
        <CheckCircle className="w-4 h-4 mr-1" />
        Resolve
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => handleStatusUpdate("DISMISSED")}
        className="border-zinc-500/20 text-zinc-400 hover:bg-zinc-500/10"
      >
        <XCircle className="w-4 h-4 mr-1" />
        Dismiss
      </Button>
    </div>
  );
}


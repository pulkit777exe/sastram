"use client";

import { useEffect, useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ThreadSummaryCardProps {
  threadId: string;
  initialSummary?: string | null;
  className?: string;
}

export function ThreadSummaryCard({
  threadId,
  initialSummary,
  className,
}: ThreadSummaryCardProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [isLoading, setIsLoading] = useState(!initialSummary);
  const router = useRouter();

  // Poll job status
  const pollJobStatus = (jobId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/ai/jobs?jobId=${jobId}`);
        if (response.ok) {
          const jobData = await response.json();
          
          if (jobData.state === "completed") {
            clearInterval(pollInterval);
            setSummary(jobData.result.summary);
            setIsLoading(false);
            toast.success("Thread summary generated!");
            router.refresh();
          } else if (jobData.state === "failed") {
            clearInterval(pollInterval);
            setIsLoading(false);
            toast.error("Failed to generate summary. Please try again.");
          }
        }
      } catch (error) {
        console.error("Failed to poll job status:", error);
        clearInterval(pollInterval);
        setIsLoading(false);
      }
    }, 2000); // Poll every 2 seconds

    return pollInterval;
  };

  // Load summary if not provided initially
  useEffect(() => {
    let intervalId: NodeJS.Timeout | undefined;
    
    if (!initialSummary) {
      const loadSummary = async () => {
        try {
          const response = await fetch("/api/ai/thread-summary", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ threadId }),
          });

          if (response.ok) {
            const data = await response.json();
            if (data.jobId) {
              // Start polling for job completion
              intervalId = pollJobStatus(data.jobId);
            }
          }
        } catch (error) {
          console.error("Failed to load thread summary:", error);
          setIsLoading(false);
        }
      };

      loadSummary();
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [initialSummary, threadId]);

  const handleSynthesize = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/ai/thread-summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ threadId }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate summary");
      }

      const data = await response.json();
      if (data.jobId) {
        // Start polling for job completion
        const pollInterval = pollJobStatus(data.jobId);
        return () => clearInterval(pollInterval);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to generate summary. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border p-5 relative overflow-hidden group bg-background/50",
        className,
      )}
    >
      <div className="flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-indigo-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-700">
            AI Summary
          </span>
        </div>
        {summary && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-400 hover:text-indigo-600"
            onClick={handleSynthesize}
            disabled={isLoading}
            title="Refresh Summary"
          >
            <RefreshCw size={12} className={cn(isLoading && "animate-spin")} />
          </Button>
        )}
      </div>

      <div className="relative z-10">
        {summary ? (
          <div className="prose prose-sm prose-indigo max-w-none">
            <p className="text-xs text-indigo-900/80 leading-relaxed">
              {summary}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-2 text-center">
            <p className="text-xs text-muted-foreground mb-3">
              Get a quick AI-powered summary of this thread (under 200 words).
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSynthesize}
              disabled={isLoading}
              className="w-full bg-indigo-50/50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 transition-all font-medium text-xs h-8"
            >
              {isLoading ? (
                <>
                  <RefreshCw size={12} className="mr-2 animate-spin" />
                  Synthesizing...
                </>
              ) : (
                <>
                  <Sparkles size={12} className="mr-2" />
                  Generate Summary
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-indigo-500/10 blur-2xl rounded-full pointer-events-none" />
    </div>
  );
}

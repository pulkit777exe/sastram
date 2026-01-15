"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchThreads } from "@/modules/threads/api-client";
import type { ThreadSummary } from "@/modules/threads/types";
import { useThreadViewStore, selectThread } from "@/stores/thread-view-store";
import { Flame, ArrowUpRight, Activity } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface ThreadInsightsProps {
  initialThreads: ThreadSummary[];
}

export function ThreadInsights({ initialThreads }: ThreadInsightsProps) {
  const selectedSlug = useThreadViewStore((state) => state.selectedThreadSlug);

  const { data = initialThreads, isFetching } = useQuery({
    queryKey: ["dashboard-threads"],
    queryFn: fetchThreads,
    initialData: initialThreads,
    staleTime: 30_000,
  });

  const busiest = useMemo(() => {
    return [...data]
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 3);
  }, [data]);

  return (
    <div className="rounded-[24px] border border-border bg-card p-5 shadow-2xl relative overflow-hidden group">
      <div className="absolute -right-8 -top-8 w-24 h-24 bg-indigo-500/10 blur-2xl rounded-full pointer-events-none" />

      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500 border border-orange-500/20">
            <Flame size={14} />
          </div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
            Live Thread Heat
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className={cn(
              "h-1.5 w-1.5 rounded-full bg-emerald-500",
              isFetching
                ? "animate-pulse"
                : "shadow-[0_0_8px_rgba(16,185,129,0.4)]"
            )}
          />
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            {isFetching ? "Syncing" : "Realtime"}
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        {busiest.map((thread) => {
          const isActive = selectedSlug === thread.slug;
          return (
            <div
              key={thread.id}
              role="button"
              tabIndex={0}
              onClick={() => selectThread(thread.slug)}
              className={cn(
                "group/item flex items-center justify-between rounded-xl px-4 py-3 transition-all duration-200 cursor-pointer border",
                isActive
                  ? "bg-indigo-600 border-indigo-500 shadow-[0_8px_20px_rgba(79,70,229,0.2)]"
                  : "bg-muted/30 border-border hover:border-border/80 hover:bg-muted/80"
              )}
            >
              <div className="flex flex-col gap-0.5">
                <span
                  className={cn(
                    "text-sm font-bold tracking-tight transition-colors",
                    isActive
                      ? "text-white"
                      : "text-foreground group-hover/item:text-foreground"
                  )}
                >
                  {thread.name}
                </span>
                <div className="flex items-center gap-2">
                  <Activity
                    size={10}
                    className={
                      isActive ? "text-indigo-200" : "text-muted-foreground"
                    }
                  />
                  <span
                    className={cn(
                      "text-[10px] font-bold uppercase tracking-tight",
                      isActive ? "text-indigo-100/70" : "text-muted-foreground"
                    )}
                  >
                    {thread.messageCount} messages
                  </span>
                </div>
              </div>

              {isActive ? (
                <ArrowUpRight size={16} className="text-white" />
              ) : (
                <div className="h-1.5 w-1.5 rounded-full bg-orange-500/40" />
              )}
            </div>
          );
        })}

        {busiest.length === 0 && (
          <div className="rounded-xl border border-dashed border-border py-8 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Cooling Down...
            </p>
          </div>
        )}
      </div>

      {selectedSlug && (
        <a
          href={`/dashboard/threads/thread/${selectedSlug}`}
          className="mt-4 flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-muted hover:bg-muted/80 text-[10px] font-bold text-muted-foreground hover:text-foreground uppercase tracking-widest transition-all"
        >
          View Full Context
        </a>
      )}
    </div>
  );
}

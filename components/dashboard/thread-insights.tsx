"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchThreads } from "@/modules/threads/api-client";
import type { ThreadSummary } from "@/modules/threads/types";
import { useThreadViewStore, selectThread } from "@/stores/thread-view-store";

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
    return [...data].sort((a, b) => b.messageCount - a.messageCount).slice(0, 3);
  }, [data]);

  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">Live thread heat</p>
        <span className="text-xs text-slate-400">{isFetching ? "Refreshing…" : "Live"}</span>
      </div>
      {selectedSlug && (
        <a
          href={`/thread/${selectedSlug}`}
          className="mt-2 inline-flex text-xs font-semibold text-blue-600 underline"
        >
          Continue thread →
        </a>
      )}
      <div className="mt-4 space-y-2">
        {busiest.map((thread) => (
          <div
            key={thread.id}
            role="button"
            tabIndex={0}
            onClick={() => selectThread(thread.slug)}
            onKeyDown={(event) => {
              if (event.key === "Enter") selectThread(thread.slug);
            }}
            className={`flex items-center justify-between rounded-2xl px-3 py-2 text-sm transition ${
              selectedSlug === thread.slug ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-700"
            }`}
          >
            <span className={selectedSlug === thread.slug ? "text-white" : "text-slate-700"}>
              {thread.title}
            </span>
            <span className={selectedSlug === thread.slug ? "text-white/80" : "text-slate-500"}>
              {thread.messageCount} msgs
            </span>
          </div>
        ))}
        {busiest.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
            No threads yet
          </div>
        )}
      </div>
    </div>
  );
}


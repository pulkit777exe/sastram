import type { ThreadSummary } from "./types";

export async function fetchThreads(): Promise<ThreadSummary[]> {
  const response = await fetch("/api/threads", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to load threads");
  }

  const data = await response.json();
  return data.threads as ThreadSummary[];
}


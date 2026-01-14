"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

type QueueItem = {
  id: string;
  status: string;
  reason: string | null;
  createdAt: string;
  message: {
    id: string;
    content: string;
    section: { name: string; slug: string };
    sender: { name: string | null; email: string };
  };
};

export function ModerationQueueView() {
  const [items, setItems] = useState<QueueItem[]>([]);

  useEffect(() => {
    void fetch("/api/v1/moderation/queue")
      .then((res) => res.json())
      .then((res) => {
        if (res?.data?.items) {
          setItems(res.data.items);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <ScrollArea className="h-[480px] rounded-md border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="space-y-3">
        {items.map((item) => (
          <Card
            key={item.id}
            className="border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>
                {item.message.sender.name || item.message.sender.email} in{" "}
                {item.message.section.name}
              </span>
              <span>{new Date(item.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-sm text-zinc-100 whitespace-pre-wrap">
              {item.message.content}
            </p>
            {item.reason && (
              <p className="text-xs text-amber-400">Reason: {item.reason}</p>
            )}
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline">
                Allow
              </Button>
              <Button size="sm" variant="destructive">
                Remove
              </Button>
            </div>
          </Card>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-zinc-500">No items in the moderation queue.</p>
        )}
      </div>
    </ScrollArea>
  );
}

export function AppealsReviewView() {
  return (
    <Card className="border-zinc-800 bg-zinc-900/60 p-6">
      <p className="text-sm text-zinc-400">
        Appeals review UI not fully implemented yet, but API endpoints are in place.
      </p>
    </Card>
  );
}

export function ModerationStatsView() {
  const [queueSize, setQueueSize] = useState<number | null>(null);

  useEffect(() => {
    void fetch("/api/v1/moderation/stats")
      .then((res) => res.json())
      .then((res) => {
        if (res?.data?.queueSize !== undefined) {
          setQueueSize(res.data.queueSize);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <Card className="border-zinc-800 bg-zinc-900/60 p-6">
      <p className="text-sm text-zinc-300">
        Current queue size:{" "}
        <span className="font-semibold">
          {queueSize !== null ? queueSize : "—"}
        </span>
      </p>
    </Card>
  );
}


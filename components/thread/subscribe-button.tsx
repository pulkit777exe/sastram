"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  subscribeToThreadAction,
  unsubscribeFromThread,
  updateSubscriptionFrequencyAction,
} from "@/modules/newsletter/actions";
import { toasts } from "@/lib/utils/toast";

type SubscriptionFrequency = "DAILY" | "WEEKLY" | "NEVER" | null;

interface ThreadSubscribeButtonProps {
  threadName?: string;
  threadId: string;
  slug: string;
  initialFrequency: SubscriptionFrequency;
}

const OPTIONS: Array<{ label: string; value: SubscriptionFrequency }> = [
  { label: "Not subscribed", value: null },
  { label: "Daily", value: "DAILY" },
  { label: "Weekly", value: "WEEKLY" },
  { label: "Never", value: "NEVER" },
];

export function ThreadSubscribeButton({
  threadName = "this thread",
  threadId,
  slug,
  initialFrequency,
}: ThreadSubscribeButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [frequency, setFrequency] = useState<SubscriptionFrequency>(
    initialFrequency,
  );
  const containerRef = useRef<HTMLDivElement | null>(null);

  const triggerLabel = useMemo(() => {
    if (!frequency) return "Not subscribed";
    if (frequency === "DAILY") return "Daily";
    if (frequency === "WEEKLY") return "Weekly";
    return "Never";
  }, [frequency]);

  useEffect(() => {
    const onOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || containerRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, []);

  const setSubscription = async (nextFrequency: SubscriptionFrequency) => {
    if (isSaving || nextFrequency === frequency) {
      setIsOpen(false);
      return;
    }

    const previous = frequency;
    setFrequency(nextFrequency);
    setIsSaving(true);
    setIsOpen(false);

    try {
      if (nextFrequency === null || nextFrequency === "NEVER") {
        const result = await unsubscribeFromThread(threadId);
        if (result.error) {
          setFrequency(previous);
          toasts.serverError();
          return;
        }

        toasts.saved();
        return;
      }

      if (!previous || previous === "NEVER") {
        const subscribe = await subscribeToThreadAction({ threadId, slug });
        if (subscribe.error) {
          setFrequency(previous);
          toasts.serverError();
          return;
        }
      }

      const update = await updateSubscriptionFrequencyAction({
        threadId,
        frequency: nextFrequency,
      });
      if (update.error) {
        setFrequency(previous);
        toasts.serverError();
        return;
      }

      toasts.saved();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="outline"
        disabled={isSaving}
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full justify-between rounded-xl border-border/70"
      >
        <span className="inline-flex items-center gap-2">
          <Bell className="h-4 w-4" />
          {triggerLabel}
        </span>
        <span className="text-xs text-muted-foreground">
          {isSaving ? "Saving..." : "Change"}
        </span>
      </Button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-2 rounded-lg border border-border bg-popover shadow-lg z-20">
          <div className="p-2">
            {OPTIONS.map((option) => (
              <button
                key={option.label}
                type="button"
                disabled={isSaving}
                onClick={() => void setSubscription(option.value)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  frequency === option.value
                    ? "bg-indigo-50 text-indigo-700"
                    : "hover:bg-muted text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            Updates for {threadName}
          </div>
        </div>
      )}
    </div>
  );
}

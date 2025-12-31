"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils/cn";
import { Bell, Check, Loader2 } from "lucide-react";
import { SubscriptionSuccessModal } from "./SubscriptionSuccessModal";

interface ThreadSubscribeButtonProps {
  subscribed: boolean;
  threadName?: string;
}

export function ThreadSubscribeButton({
  subscribed,
  threadName = "this thread",
}: ThreadSubscribeButtonProps) {
  const { pending } = useFormStatus();
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [wasJustSubscribed, setWasJustSubscribed] = useState(false);

  // Check if we just completed subscription
  if (!pending && wasJustSubscribed && !showSuccessModal) {
    setShowSuccessModal(true);
    setWasJustSubscribed(false);
  }

  // Track when pending starts
  if (pending && !wasJustSubscribed) {
    setWasJustSubscribed(true);
  }

  const label = subscribed ? "Subscribed" : "Subscribe to newsletter";
  const Icon = subscribed ? Check : pending ? Loader2 : Bell;

  return (
    <>
      <Button
        type="submit"
        variant={subscribed ? "outline" : "default"}
        disabled={pending || subscribed}
        className={cn(
          "w-full rounded-xl font-medium transition-all group",
          subscribed
            ? "bg-[#1C1C1E] border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
            : "bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40"
        )}
      >
        <Icon
          className={cn(
            "w-4 h-4 mr-2 transition-transform",
            pending && "animate-spin",
            !subscribed && !pending && "group-hover:scale-110"
          )}
        />
        {pending ? "Subscribing..." : label}
      </Button>

      <SubscriptionSuccessModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        threadName={threadName}
      />
    </>
  );
}

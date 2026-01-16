"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils/cn";
import { Bell, Check, Loader2 } from "lucide-react";
import { SubscriptionSuccessModal } from "./SubscriptionSuccessModal";
import { AnimatedIcon } from "@/components/ui/animated-icon";

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
          "w-full rounded-xl font-medium transition-all group bg-gradient-to-r from-indigo-500 to-indigo-600 hover:bg-indigo-400",
          subscribed
            ? "bg-secondary"
            : "shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40"
        )}
      >
        <AnimatedIcon
          icon={Icon}
          animateOnHover={!pending}
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

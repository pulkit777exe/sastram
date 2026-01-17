"use client";

import { useState, useEffect, useRef } from "react";
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
  const prevPendingRef = useRef(false);

  // Use effect to detect transition from pending to not pending
  useEffect(() => {
    const wasPending = prevPendingRef.current;
    
    // Update ref for next time
    prevPendingRef.current = pending;

    // Trigger modal on next tick to avoid synchronous setState
    if (wasPending && !pending && !subscribed) {
      const timer = setTimeout(() => setShowSuccessModal(true), 0);
      return () => clearTimeout(timer);
    }
  }, [pending, subscribed]);

  const label = subscribed ? "Subscribed" : "Subscribe to newsletter";
  const Icon = subscribed ? Check : pending ? Loader2 : Bell;

  return (
    <>
      <Button
        type="submit"
        variant={subscribed ? "outline" : "default"}
        disabled={pending || subscribed}
        className={cn(
          "w-full rounded-xl font-medium transition-all group bg-linear-to-r from-indigo-500 to-indigo-600 hover:bg-indigo-400 text-white",
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
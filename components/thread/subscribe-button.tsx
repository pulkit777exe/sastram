"use client";

import { Button } from "@/components/ui/button";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils/cn";

interface ThreadSubscribeButtonProps {
  subscribed: boolean;
}

export function ThreadSubscribeButton({ subscribed }: ThreadSubscribeButtonProps) {
  const { pending } = useFormStatus();
  const label = subscribed ? "Subscribed" : "Subscribe to newsletter";

  return (
    <Button
      type="submit"
      variant={subscribed ? "outline" : "default"}
      disabled={pending || subscribed}
      className={cn(
        "w-full rounded-xl font-medium transition-all",
        subscribed
          ? "bg-[#1C1C1E] border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
          : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40"
      )}
    >
      {pending ? "Working..." : label}
    </Button>
  );
}


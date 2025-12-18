"use client";

import { Button } from "@/components/ui/button";
import { useFormStatus } from "react-dom";

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
      className="w-1/2 rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm hover:bg-slate-50"
    >
      {pending ? "Working..." : label}
    </Button>
  );
}

